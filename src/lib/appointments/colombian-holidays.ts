import { isHoliday } from "colombian-holidays/isHoliday";

/**
 * Check whether a YYYY-MM-DD date is a Colombian public holiday.
 *
 * TEFF stores appointment calendar dates independently of time zones.
 * Using UTC midnight prevents local time zone conversions from
 * shifting the requested calendar date.
 */
export function isColombianHoliday(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const calendarDate = new Date(
    Date.UTC(year, month - 1, day),
  );

  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error("Invalid calendar date.");
  }

  return isHoliday(calendarDate);
}
