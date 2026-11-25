import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { queueGoogleCalendarSync } from "@/lib/google-calendar/queue";
import { triggerGoogleCalendarSync } from "@/lib/google-calendar/trigger-sync";
import { queueWhatsAppNotification } from "@/lib/whatsapp/queue";
import {
  getWhatsAppReminderTime,
  shouldQueueWhatsAppReminder,
} from "@/lib/whatsapp/reminders";
import { getTeffCurrentMinutes, getTeffToday } from "@/lib/datetime";
import { isOutsideStaffScheduleHours } from "@/lib/appointments/staff-scheduling";

function getPayrollMonday(date: Date): Date {
  // Payroll weeks run Monday through Sunday.
  const monday = new Date(date);
  const weekday = monday.getUTCDay();

  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

  monday.setUTCDate(monday.getUTCDate() - daysSinceMonday);

  return monday;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  // Only authenticated TEFF staff can change appointment schedules.
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Owner and Receptionist can manage appointment schedules.
  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();

    const appointmentId = Number(id);
    const date = body.date;
    const startTime = body.startTime;
    const overrideOverlap = body.overrideOverlap === true;
    const overrideOutsideHours = body.overrideOutsideHours === true;

    if (
      !Number.isInteger(appointmentId) ||
      appointmentId <= 0 ||
      typeof date !== "string" ||
      typeof startTime !== "string"
    ) {
      return Response.json(
        { error: "Invalid appointment schedule" },
        { status: 400 },
      );
    }

    // Validate YYYY-MM-DD.
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

    let isValidDate = false;

    if (dateMatch) {
      const year = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const day = Number(dateMatch[3]);

      const parsedDate = new Date(Date.UTC(year, month - 1, day));

      isValidDate =
        parsedDate.getUTCFullYear() === year &&
        parsedDate.getUTCMonth() === month - 1 &&
        parsedDate.getUTCDate() === day;
    }

    const isValidStartTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);

    if (!isValidDate || !isValidStartTime) {
      return Response.json(
        { error: "Invalid appointment date or time" },
        { status: 400 },
      );
    }

    if (date < getTeffToday()) {
      return Response.json(
        { error: "Appointment date cannot be in the past" },
        { status: 400 },
      );
    }

    const appointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        startTime: true,
        duration: true,
        status: true,
      },
    });

    if (!appointment) {
      return Response.json({ error: "Appointment not found" }, { status: 404 });
    }

    // Receptionist may only reschedule appointments before service begins.
    const receptionistAllowedStatuses = ["REQUESTED", "BOOKED", "CHECKED_IN"];

    if (
      session.user.role === "RECEPTIONIST" &&
      !receptionistAllowedStatuses.includes(appointment.status)
    ) {
      return Response.json(
        {
          error: `Receptionist cannot reschedule an appointment with status ${appointment.status}`,
        },
        { status: 403 },
      );
    }

    function timeToMinutes(time: string) {
      const [hours, minutes] = time.split(":").map(Number);

      return hours * 60 + minutes;
    }

    const requestedStart = timeToMinutes(startTime);

    if (isOutsideStaffScheduleHours(date, startTime) && !overrideOutsideHours) {
      return Response.json(
        {
          error:
            "La hora seleccionada está fuera del horario habitual del salón.",
          conflictType: "OUTSIDE_HOURS",
        },
        { status: 409 },
      );
    }

    const requestedEnd = requestedStart + appointment.duration;

    if (date === getTeffToday() && requestedStart <= getTeffCurrentMinutes()) {
      return Response.json(
        { error: "Appointment time cannot be in the past" },
        { status: 400 },
      );
    }

    const maxAttempts = 3;
    let result = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            // Reload the appointment inside the transaction.
            const currentAppointment = await tx.appointment.findUnique({
              where: { id: appointmentId },
              select: {
                id: true,
                date: true,
                employeeId: true,
                status: true,
                saleAppointments: {
                  select: { saleId: true },
                },
              },
            });

            if (!currentAppointment) {
              throw new Error("APPOINTMENT_NOT_FOUND");
            }

            const originalMonday = getPayrollMonday(currentAppointment.date);

            const requestedMonday = getPayrollMonday(
              new Date(`${date}T00:00:00.000Z`),
            );

            // Acquire both week locks in a consistent order.
            const weeks = [originalMonday, requestedMonday];

            const uniqueWeeks = Array.from(
              new Map(
                weeks.map((week) => [week.toISOString().slice(0, 10), week]),
              ).values(),
            ).sort((a, b) => a.getTime() - b.getTime());

            for (const week of uniqueWeeks) {
              await lockPayrollWeek(tx, week);
            }

            // Recheck after acquiring the payroll locks.
            const lockedAppointment = await tx.appointment.findUnique({
              where: { id: appointmentId },
              select: {
                id: true,
                date: true,
                startTime: true,
                employeeId: true,
                status: true,
                saleAppointments: {
                  select: { saleId: true },
                },
              },
            });

            if (!lockedAppointment) {
              throw new Error("APPOINTMENT_NOT_FOUND");
            }

            // Do not proceed using a stale appointment snapshot.
            if (
              lockedAppointment.date.getTime() !==
                currentAppointment.date.getTime() ||
              lockedAppointment.employeeId !== currentAppointment.employeeId ||
              lockedAppointment.status !== currentAppointment.status ||
              lockedAppointment.saleAppointments.length !==
                currentAppointment.saleAppointments.length
            ) {
              throw new Error("APPOINTMENT_CHANGED");
            }

            // Verify the acquired locks still cover the appointment's week.
            const lockedMonday = getPayrollMonday(lockedAppointment.date);

            if (
              !uniqueWeeks.some(
                (week) => week.getTime() === lockedMonday.getTime(),
              )
            ) {
              throw new Error("APPOINTMENT_CHANGED");
            }

            // A sold appointment must not be moved into or out
            // of an approved payroll period.
            if (lockedAppointment.saleAppointments.length > 0) {
              const lockedPeriods = await tx.payrollPeriod.count({
                where: {
                  startDate: {
                    in: uniqueWeeks,
                  },
                  status: {
                    in: ["REVIEWED", "PAID"],
                  },
                },
              });

              if (lockedPeriods > 0) {
                throw new Error("PAYROLL_LOCKED");
              }
            }

            const scheduleBlockingStatuses = [
              "REQUESTED",
              "BOOKED",
              "CHECKED_IN",
              "IN_PROGRESS",
            ];

            if (scheduleBlockingStatuses.includes(appointment.status)) {
              const existingAppointments = await tx.appointment.findMany({
                where: {
                  employeeId: appointment.employeeId,
                  date: new Date(`${date}T00:00:00.000Z`),
                  id: {
                    not: appointment.id,
                  },
                  status: {
                    in: scheduleBlockingStatuses,
                  },
                },
              });

              const existingScheduleBlocks =
                await tx.employeeScheduleBlock.findMany({
                  where: {
                    employeeId: appointment.employeeId,
                    date: new Date(`${date}T00:00:00.000Z`),
                  },
                });

              const hasConflict = existingAppointments.some(
                (existingAppointment) => {
                  const existingStart = timeToMinutes(
                    existingAppointment.startTime,
                  );

                  const existingEnd =
                    existingStart + existingAppointment.duration;

                  return (
                    requestedStart < existingEnd && requestedEnd > existingStart
                  );
                },
              );

              const hasScheduleBlockConflict = existingScheduleBlocks.some(
                (scheduleBlock) => {
                  const blockedStart = timeToMinutes(scheduleBlock.startTime);

                  const blockedEnd = timeToMinutes(scheduleBlock.endTime);

                  return (
                    requestedStart < blockedEnd && requestedEnd > blockedStart
                  );
                },
              );

              // Schedule blocks such as vacation or late arrival cannot be overridden.
              if (hasScheduleBlockConflict) {
                throw new Error("SCHEDULE_BLOCK_CONFLICT");
              }

              // Owner/Receptionist may intentionally override another appointment overlap.
              if (hasConflict && !overrideOverlap) {
                throw new Error("APPOINTMENT_CONFLICT");
              }
            }
            // Update only if the appointment still matches
            // the state verified inside this transaction.
            const updated = await tx.appointment.updateMany({
              where: {
                id: lockedAppointment.id,
                date: lockedAppointment.date,
                employeeId: lockedAppointment.employeeId,
                status: lockedAppointment.status,
                startTime: lockedAppointment.startTime,
              },
              data: {
                date: new Date(`${date}T00:00:00.000Z`),
                startTime,
              },
            });

            if (updated.count !== 1) {
              throw new Error("APPOINTMENT_CHANGED");
            }

            // Only invalidate notifications when the schedule
            // actually changes. Keep this inside the same transaction.
            const scheduleChanged =
              lockedAppointment.date.toISOString().slice(0, 10) !== date ||
              lockedAppointment.startTime !== startTime;

            if (
              scheduleChanged &&
              lockedAppointment.status === "BOOKED" &&
              process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true"
            ) {
              await queueGoogleCalendarSync(tx, "APPOINTMENT", appointmentId);
            }

            if (
              scheduleChanged &&
              process.env.TEFF_WHATSAPP_QUEUE_ENABLED === "true"
            ) {
              // Invalidate notifications for the previous schedule.
              await tx.whatsAppNotification.updateMany({
                where: {
                  appointmentId,
                  status: "PENDING",
                },
                data: {
                  status: "CANCELLED",
                },
              });

              // Only confirmed appointments receive reminders.
              // Apply the 24-hour cutoff to the new schedule.
              if (lockedAppointment.status === "BOOKED") {
                const updatedAppointment =
                  await tx.appointment.findUniqueOrThrow({
                    where: { id: appointmentId },
                    select: {
                      id: true,
                      bookingId: true,
                      date: true,
                      startTime: true,
                      customer: {
                        select: { phone: true },
                      },
                    },
                  });

                if (
                  updatedAppointment.customer.phone &&
                  shouldQueueWhatsAppReminder(
                    updatedAppointment.date,
                    updatedAppointment.startTime,
                  )
                ) {
                  await queueWhatsAppNotification(tx, {
                    appointmentId: updatedAppointment.id,
                    bookingId: updatedAppointment.bookingId,
                    type: "APPOINTMENT_REMINDER",
                    recipientPhone: updatedAppointment.customer.phone,
                    appointmentDate: updatedAppointment.date,
                    appointmentTime: updatedAppointment.startTime,
                    scheduledFor: getWhatsAppReminderTime(
                      updatedAppointment.date,
                      updatedAppointment.startTime,
                    ),
                    // A new schedule revision receives a new reminder key,
                    // even when the appointment returns to an earlier time.
                    idempotencyKey: `appointment-reminder:${updatedAppointment.id}:${crypto.randomUUID()}`,
                  });
                }
              }
            }

            return tx.appointment.findUniqueOrThrow({
              where: { id: appointmentId },
            });
          },
          {
            isolationLevel: "Serializable",
          },
        );

        break;
      } catch (error) {
        // Business conflicts must not be retried.
        if (
          error instanceof Error &&
          [
            "APPOINTMENT_CONFLICT",
            "SCHEDULE_BLOCK_CONFLICT",
            "PAYROLL_LOCKED",
            "APPOINTMENT_CHANGED",
            "APPOINTMENT_NOT_FOUND",
          ].includes(error.message)
        ) {
          throw error;
        }

        const isSerializableConflict =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034";

        if (!isSerializableConflict) {
          throw error;
        }

        if (attempt === maxAttempts) {
          throw new Error("SCHEDULE_CONFLICT");
        }
      }
    }

    if (!result) {
      throw new Error("Unable to complete appointment reschedule");
    }

    // Trigger Google Calendar synchronization only after
    // the rescheduling transaction has successfully committed.
    if (
      result.status === "BOOKED" &&
      process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true"
    ) {
      triggerGoogleCalendarSync();
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "PAYROLL_LOCKED") {
      return Response.json(
        {
          error:
            "No se puede modificar esta cita porque pertenece a una nómina revisada o pagada.",
          conflictType: "PAYROLL_LOCKED",
        },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message === "APPOINTMENT_CHANGED") {
      return Response.json(
        {
          error:
            "La cita fue modificada simultáneamente. Actualiza e inténtalo nuevamente.",
          conflictType: "APPOINTMENT_CHANGED",
        },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message === "APPOINTMENT_NOT_FOUND") {
      return Response.json({ error: "Cita no encontrada." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "APPOINTMENT_CONFLICT") {
      return Response.json(
        {
          error: "Appointment overlaps another appointment",
          conflictType: "APPOINTMENT",
        },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message === "SCHEDULE_BLOCK_CONFLICT") {
      return Response.json(
        {
          error: "Employee has a schedule block during this time",
          conflictType: "SCHEDULE_BLOCK",
        },
        { status: 409 },
      );
    }

    if (error instanceof Error && error.message === "SCHEDULE_CONFLICT") {
      return Response.json(
        {
          error: "Employee is not available for the full appointment time",
        },
        { status: 409 },
      );
    }

    console.error("Failed to reschedule appointment:", error);

    return Response.json(
      { error: "Unable to reschedule appointment" },
      { status: 500 },
    );
  }
}
