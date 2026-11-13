import type { GoogleCalendarSyncTarget } from "@/generated/prisma/enums";

export function getGoogleCalendarEventId(
  target: GoogleCalendarSyncTarget,
  targetId: number,
): string {
  const prefix = target === "APPOINTMENT" ? "teffappointment" : "teffblock";

  return `${prefix}${targetId}`;
}
