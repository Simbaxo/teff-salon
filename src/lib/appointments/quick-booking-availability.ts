import type { Prisma } from "@/generated/prisma/client";
import type { QuickBookingPlannedAppointment } from "./quick-booking-plan";
import {
  checkQuickBookingConflicts,
  type QuickBookingConflict,
} from "./quick-booking-conflicts";

type AvailabilityInput = {
  tx: Prisma.TransactionClient;
  date: string;
  planned: QuickBookingPlannedAppointment[];
};

export async function checkQuickBookingDatabaseAvailability({
  tx,
  date,
  planned,
}: AvailabilityInput): Promise<QuickBookingConflict> {
  if (planned.length === 0) {
    throw new Error("INVALID_BOOKING_PLAN");
  }

  const employeeIds = [
    ...new Set(planned.map((appointment) => appointment.employeeId)),
  ];

  const bookingDate = new Date(`${date}T00:00:00.000Z`);

  // Only active appointments occupy technician time.
  const existingAppointments = await tx.appointment.findMany({
    where: {
      date: bookingDate,
      employeeId: {
        in: employeeIds,
      },
      status: {
        in: ["BOOKED", "REQUESTED", "CHECKED_IN", "IN_PROGRESS"],
      },
    },
    select: {
      employeeId: true,
      startTime: true,
      duration: true,
    },
  });

  // Schedule blocks represent unavailable technician time,
  // such as vacation, time off, or arriving late.
  const scheduleBlocks = await tx.employeeScheduleBlock.findMany({
    where: {
      date: bookingDate,
      employeeId: {
        in: employeeIds,
      },
    },
    select: {
      employeeId: true,
      startTime: true,
      endTime: true,
    },
  });

  return checkQuickBookingConflicts(
    planned,
    existingAppointments,
    scheduleBlocks,
  );
}
