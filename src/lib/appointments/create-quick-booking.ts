import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { getTeffCurrentMinutes, getTeffToday } from "@/lib/datetime";
import { isOutsideStaffScheduleHours } from "./staff-scheduling";
import { buildQuickBookingPlan } from "./quick-booking-plan";
import { checkQuickBookingDatabaseAvailability } from "./quick-booking-availability";
import { queueGoogleCalendarSync } from "@/lib/google-calendar/queue";
import { queueWhatsAppNotification } from "@/lib/whatsapp/queue";
import { createHash } from "node:crypto";
import {
  getWhatsAppReminderTime,
  shouldQueueWhatsAppReminder,
} from "@/lib/whatsapp/reminders";

type QuickBookingCustomer =
  | { kind: "existing"; id: number }
  | {
      kind: "new";
      name: string;
      phone: string;
      email: string;
    };

type QuickBookingInput = {
  requestKey: string;
  customer: QuickBookingCustomer;
  services: {
    serviceId: number;
    employeeId: number;
  }[];
  date: string;
  startTime: string;
  overrideOverlap: boolean;
  overrideOutsideHours: boolean;
};

export function getQuickBookingRequestHash(
  input: Pick<
    QuickBookingInput,
    "customer" | "services" | "date" | "startTime"
  >,
): string {
  const customerFingerprint =
    input.customer.kind === "existing"
      ? {
          kind: "existing" as const,
          id: input.customer.id,
        }
      : {
          kind: "new" as const,
          name: input.customer.name.trim(),
          phone: normalizePhoneNumber(input.customer.phone),
          email: input.customer.email.trim().toLowerCase(),
        };

  const requestFingerprint = {
    customer: customerFingerprint,
    date: input.date,
    startTime: input.startTime,
    services: [...input.services].sort((a, b) => a.serviceId - b.serviceId),
  };

  return createHash("sha256")
    .update(JSON.stringify(requestFingerprint))
    .digest("hex");
}

export async function createQuickBooking(input: QuickBookingInput) {
  if (
    typeof input.requestKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestKey,
    )
  ) {
    throw new Error("QUICK_BOOKING_INVALID_REQUEST_KEY");
  }

  const requestKey = input.requestKey.toLowerCase();
  const bookingDate = new Date(`${input.date}T00:00:00.000Z`);

  // Normalize the requested details so an identical retry has
  // the same fingerprint, regardless of service array ordering.
  const requestHash = getQuickBookingRequestHash(input);

  return prisma.$transaction(
    async (tx) => {
      // Serialize submissions sharing the same request identifier.
      // This lock is separate from technician scheduling locks.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          73422,
          hashtext(${requestKey})
        )::text
      `;

      const previousBooking = await tx.booking.findUnique({
        where: {
          internalRequestKey: requestKey,
        },
        select: {
          id: true,
          customerId: true,
          internalRequestHash: true,
          appointments: {
            select: {
              id: true,
            },
            orderBy: {
              id: "asc",
            },
          },
        },
      });

      if (previousBooking) {
        if (previousBooking.internalRequestHash !== requestHash) {
          throw new Error("QUICK_BOOKING_REQUEST_KEY_CONFLICT");
        }

        return {
          bookingId: previousBooking.id,
          customerId: previousBooking.customerId,
          appointmentIds: previousBooking.appointments.map(
            (appointment) => appointment.id,
          ),
          duplicate: true,
        };
      }

      const selectedServiceIds = input.services.map(
        (selection) => selection.serviceId,
      );

      const employeeIds = [
        ...new Set(input.services.map((selection) => selection.employeeId)),
      ].sort((a, b) => a - b);

      // Coordinate technician changes and booking creation.
      for (const employeeId of employeeIds) {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(73421, ${employeeId})::text
        `;
      }

      // Refresh service data inside the transaction.
      const services = await tx.service.findMany({
        where: {
          id: { in: selectedServiceIds },
          active: true,
        },
        select: {
          id: true,
          category: true,
          price: true,
          estimatedDuration: true,
          requiresApproval: true,
        },
      });

      if (services.length !== input.services.length) {
        throw new Error("QUICK_BOOKING_INVALID_SERVICE");
      }

      const servicesById = new Map(
        services.map((service) => [service.id, service]),
      );

      // Revalidate technician eligibility and qualifications.
      const employees = await tx.employee.findMany({
        where: {
          id: { in: employeeIds },
          active: true,
          isBookable: true,
          compensationType: "COMMISSION",
        },
        select: {
          id: true,
          employeeServices: {
            select: { serviceId: true },
          },
        },
      });

      if (employees.length !== employeeIds.length) {
        throw new Error("QUICK_BOOKING_INVALID_EMPLOYEE");
      }

      const employeesById = new Map(
        employees.map((employee) => [employee.id, employee]),
      );

      for (const selection of input.services) {
        const employee = employeesById.get(selection.employeeId);

        if (
          !employee?.employeeServices.some(
            (item) => item.serviceId === selection.serviceId,
          )
        ) {
          throw new Error("QUICK_BOOKING_INVALID_EMPLOYEE");
        }
      }

      const nailEmployeeIds = new Set(
        input.services
          .filter(
            (selection) =>
              servicesById.get(selection.serviceId)?.category === "NAILS",
          )
          .map((selection) => selection.employeeId),
      );

      if (nailEmployeeIds.size > 1) {
        throw new Error("QUICK_BOOKING_INVALID_EMPLOYEE");
      }

      const plan = buildQuickBookingPlan(
        input.startTime,
        input.services.map((selection) => {
          const service = servicesById.get(selection.serviceId);

          if (!service) {
            throw new Error("QUICK_BOOKING_INVALID_SERVICE");
          }

          return {
            id: service.id,
            employeeId: selection.employeeId,
            price: service.price,
            estimatedDuration: service.estimatedDuration,
            requiresApproval: service.requiresApproval,
          };
        }),
      );

      // Recheck appointment date and time inside the transaction.
      if (
        input.date < getTeffToday() ||
        (input.date === getTeffToday() &&
          plan[0].startMinutes <= getTeffCurrentMinutes())
      ) {
        throw new Error("QUICK_BOOKING_PAST_TIME");
      }

      if (
        isOutsideStaffScheduleHours(input.date, input.startTime) &&
        !input.overrideOutsideHours
      ) {
        throw new Error("QUICK_BOOKING_OUTSIDE_HOURS");
      }

      const conflict = await checkQuickBookingDatabaseAvailability({
        tx,
        date: input.date,
        planned: plan,
      });

      if (conflict === "SCHEDULE_BLOCK") {
        throw new Error("QUICK_BOOKING_SCHEDULE_BLOCK");
      }

      if (conflict === "APPOINTMENT" && !input.overrideOverlap) {
        throw new Error("QUICK_BOOKING_OVERLAP");
      }

      // Create or reuse the customer only after validation succeeds.
      let customer;

      if (input.customer.kind === "existing") {
        customer = await tx.customer.findUnique({
          where: { id: input.customer.id },
        });

        if (!customer) {
          throw new Error("QUICK_BOOKING_CUSTOMER_NOT_FOUND");
        }
      } else {
        const phone = normalizePhoneNumber(input.customer.phone);

        if (!phone) {
          throw new Error("QUICK_BOOKING_INVALID_CUSTOMER");
        }

        // Do not overwrite an existing customer's details.
        customer = await tx.customer.upsert({
          where: { phone },
          create: {
            name: input.customer.name.trim(),
            phone,
            email: input.customer.email.trim() || null,
          },
          update: {},
        });
      }

      const booking = await tx.booking.create({
        data: {
          customerId: customer.id,
          date: bookingDate,
          source: "INTERNAL",
          internalRequestKey: requestKey,
          internalRequestHash: requestHash,
        },
      });

      const appointments = [];

      for (const item of plan) {
        const appointment = await tx.appointment.create({
          data: {
            bookingId: booking.id,
            customerId: customer.id,
            employeeId: item.employeeId,
            date: bookingDate,
            startTime: item.startTime,
            duration: item.duration,
            status: item.status,
            appointmentServices: {
              create: {
                serviceId: item.serviceId,
                bookedPrice: item.bookedPrice,
                bookedDuration: item.duration,
              },
            },
          },
        });

        appointments.push(appointment);
      }

      // Preserve Google Calendar's existing queue behavior.
      if (process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true") {
        for (const appointment of appointments) {
          if (appointment.status === "BOOKED") {
            await queueGoogleCalendarSync(tx, "APPOINTMENT", appointment.id);
          }
        }
      }

      // Normalize the customer's phone for WhatsApp notifications.
      // An invalid legacy phone must not prevent booking creation.
      const whatsappPhone = customer.phone
        ? normalizePhoneNumber(customer.phone)
        : null;

      // Actual sending remains controlled separately.
      if (process.env.TEFF_WHATSAPP_QUEUE_ENABLED === "true" && whatsappPhone) {
        for (const appointment of appointments) {
          if (appointment.status !== "BOOKED") continue;

          await queueWhatsAppNotification(tx, {
            appointmentId: appointment.id,
            bookingId: booking.id,
            type: "BOOKING_CONFIRMATION",
            recipientPhone: whatsappPhone,
            appointmentDate: appointment.date,
            appointmentTime: appointment.startTime,
            scheduledFor: new Date(),
            idempotencyKey: `booking-confirmation:${appointment.id}`,
          });

          if (
            shouldQueueWhatsAppReminder(appointment.date, appointment.startTime)
          ) {
            await queueWhatsAppNotification(tx, {
              appointmentId: appointment.id,
              bookingId: booking.id,
              type: "APPOINTMENT_REMINDER",
              recipientPhone: whatsappPhone,
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
      }

      return {
        bookingId: booking.id,
        customerId: customer.id,
        appointmentIds: appointments.map((item) => item.id),
        duplicate: false,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  );
}
