import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { hasTeffAppointmentStarted } from "@/lib/datetime";
import { queueGoogleCalendarSync } from "@/lib/google-calendar/queue";
import { triggerGoogleCalendarSync } from "@/lib/google-calendar/trigger-sync";
import { queueWhatsAppNotification } from "@/lib/whatsapp/queue";
import {
  getWhatsAppReminderTime,
  shouldQueueWhatsAppReminder,
} from "@/lib/whatsapp/reminders";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();

    const appointmentId = Number(id);
    const { status } = body;

    if (!Number.isSafeInteger(appointmentId) || appointmentId <= 0 || !status) {
      return Response.json(
        { error: "Missing appointment information" },
        { status: 400 },
      );
    }

    const allowedStatuses = [
      "BOOKED",
      "REQUESTED",
      "CHECKED_IN",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
    ];

    if (!allowedStatuses.includes(status)) {
      return Response.json(
        { error: "Invalid appointment status" },
        { status: 400 },
      );
    }

    const existingAppointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        status: true,
        date: true,
        startTime: true,
      },
    });

    if (!existingAppointment) {
      return Response.json({ error: "Appointment not found" }, { status: 404 });
    }

    const allowedTransitions: Record<string, string[]> = {
      REQUESTED: ["BOOKED", "CANCELLED"],
      BOOKED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
      CHECKED_IN: ["IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["COMPLETED"],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: [],
    };

    const validNextStatuses =
      allowedTransitions[existingAppointment.status] ?? [];

    if (!validNextStatuses.includes(status)) {
      return Response.json(
        {
          error: `Cannot change appointment from ${existingAppointment.status} to ${status}`,
        },
        { status: 400 },
      );
    }

    if (
      status === "NO_SHOW" &&
      !hasTeffAppointmentStarted(
        existingAppointment.date.toISOString().slice(0, 10),
        existingAppointment.startTime,
      )
    ) {
      return Response.json(
        {
          error: "Cannot mark appointment as a no-show before its start time",
        },
        { status: 400 },
      );
    }

    const queueEnabled = process.env.TEFF_WHATSAPP_QUEUE_ENABLED === "true";

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.updateMany({
        where: {
          id: appointmentId,
          status: existingAppointment.status,
        },
        data: {
          status,

          ...(status === "CHECKED_IN" ? { checkedInAt: new Date() } : {}),

          ...(status === "IN_PROGRESS" ? { startedAt: new Date() } : {}),

          ...(status === "COMPLETED" ? { completedAt: new Date() } : {}),
        },
      });

      if (updated.count !== 1) {
        return null;
      }

      const appointment = await tx.appointment.findUniqueOrThrow({
        where: { id: appointmentId },
        include: {
          customer: {
            select: { phone: true },
          },
        },
      });

      const approvedBooking =
        existingAppointment.status === "REQUESTED" && status === "BOOKED";

      if (
        process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true" &&
        (approvedBooking || status === "CANCELLED")
      ) {
        await queueGoogleCalendarSync(tx, "APPOINTMENT", appointmentId);
      }

      if (queueEnabled) {
        if (status === "CANCELLED") {
          // Prevent unsent reminders or confirmations
          // from being delivered after cancellation.
          await tx.whatsAppNotification.updateMany({
            where: {
              appointmentId,
              status: "PENDING",
            },
            data: {
              status: "CANCELLED",
            },
          });
        }

        const notificationType =
          status === "BOOKED" && existingAppointment.status === "REQUESTED"
            ? "BOOKING_CONFIRMATION"
            : status === "CANCELLED"
              ? "APPOINTMENT_CANCELLATION"
              : null;

        if (notificationType && appointment.customer.phone) {
          await queueWhatsAppNotification(tx, {
            appointmentId: appointment.id,
            bookingId: appointment.bookingId,
            type: notificationType,
            recipientPhone: appointment.customer.phone,
            appointmentDate: appointment.date,
            appointmentTime: appointment.startTime,
            scheduledFor: new Date(),
            idempotencyKey: `${notificationType}:${appointment.id}`,
          });
        }
        // Schedule a 24-hour reminder when a requested
        // appointment is approved sufficiently far in advance.
        if (
          status === "BOOKED" &&
          existingAppointment.status === "REQUESTED" &&
          appointment.customer.phone &&
          shouldQueueWhatsAppReminder(appointment.date, appointment.startTime)
        ) {
          await queueWhatsAppNotification(tx, {
            appointmentId: appointment.id,
            bookingId: appointment.bookingId,
            type: "APPOINTMENT_REMINDER",
            recipientPhone: appointment.customer.phone,
            appointmentDate: appointment.date,
            appointmentTime: appointment.startTime,
            scheduledFor: getWhatsAppReminderTime(
              appointment.date,
              appointment.startTime,
            ),
            idempotencyKey: `appointment-reminder:${appointment.id}:${appointment.date.toISOString().slice(0, 10)}:${appointment.startTime}`,
          });
        }
      }

      return appointment;
    });

    if (!result) {
      return Response.json(
        {
          error:
            "La cita fue modificada por otra operación. Actualiza e inténtalo nuevamente.",
          conflictType: "APPOINTMENT_CHANGED",
        },
        { status: 409 },
      );
    }

    // Trigger Google Calendar synchronization only after
    // a successful approval or cancellation transaction.
    if (
      process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true" &&
      ((existingAppointment.status === "REQUESTED" && status === "BOOKED") ||
        status === "CANCELLED")
    ) {
      triggerGoogleCalendarSync();
    }

    const { customer: _customer, ...appointment } = result;

    return Response.json(appointment);
  } catch (error) {
    console.error("Failed to update appointment status:", error);

    return Response.json(
      { error: "Unable to update appointment status" },
      { status: 500 },
    );
  }
}
