import type { QuickBookingPlannedAppointment } from "./quick-booking-plan";

type ExistingAppointment = {
  employeeId: number;
  startTime: string;
  duration: number;
};

type ExistingScheduleBlock = {
  employeeId: number;
  startTime: string;
  endTime: string;
};

export type QuickBookingConflict = "APPOINTMENT" | "SCHEDULE_BLOCK" | null;

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
}

function overlaps(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

export function checkQuickBookingConflicts(
  planned: QuickBookingPlannedAppointment[],
  existingAppointments: ExistingAppointment[],
  scheduleBlocks: ExistingScheduleBlock[],
): QuickBookingConflict {
  // Schedule blocks must never be bypassed by an overlap override.
  for (const appointment of planned) {
    const blocked = scheduleBlocks.some((block) => {
      if (block.employeeId !== appointment.employeeId) {
        return false;
      }

      return overlaps(
        appointment.startMinutes,
        appointment.endMinutes,
        timeToMinutes(block.startTime),
        timeToMinutes(block.endTime),
      );
    });

    if (blocked) {
      return "SCHEDULE_BLOCK";
    }
  }

  // Existing appointment conflicts may be confirmed by staff.
  for (const appointment of planned) {
    const conflicting = existingAppointments.some((existing) => {
      if (existing.employeeId !== appointment.employeeId) {
        return false;
      }

      const start = timeToMinutes(existing.startTime);

      return overlaps(
        appointment.startMinutes,
        appointment.endMinutes,
        start,
        start + existing.duration,
      );
    });

    if (conflicting) {
      return "APPOINTMENT";
    }
  }

  return null;
}
