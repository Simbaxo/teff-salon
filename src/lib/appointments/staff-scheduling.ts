import { getTeffDayOfWeek } from "@/lib/datetime";
import { isColombianHoliday } from "./colombian-holidays";

export type StaffScheduleHours = {
  openingMinutes: number;
  latestStartMinutes: number;
};

// Sundays and Colombian public holidays use the same booking hours.
export function getStaffScheduleHours(date: string): StaffScheduleHours {
  const isSunday = getTeffDayOfWeek(date) === 0;
  const isSundayOrHoliday = isSunday || isColombianHoliday(date);

  return {
    openingMinutes: isSundayOrHoliday ? 10 * 60 + 30 : 9 * 60 + 30,

    latestStartMinutes: isSundayOrHoliday ? 17 * 60 : 18 * 60 + 30,
  };
}

// Common appointment times for the staff dropdown.
// Custom times will be entered separately.
export function getStaffTimeOptions(): string[] {
  const options: string[] = [];

  for (let minutes = 9 * 60 + 30; minutes <= 18 * 60 + 30; minutes += 30) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    options.push(
      `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
    );
  }

  return options;
}

export function isOutsideStaffScheduleHours(
  date: string,
  startTime: string,
): boolean {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);

  if (!match) {
    throw new Error("Invalid appointment start time.");
  }

  const startMinutes = Number(match[1]) * 60 + Number(match[2]);

  const { openingMinutes, latestStartMinutes } = getStaffScheduleHours(date);

  return startMinutes < openingMinutes || startMinutes > latestStartMinutes;
}
