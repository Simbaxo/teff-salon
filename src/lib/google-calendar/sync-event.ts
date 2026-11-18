import type { GoogleCalendarSyncTarget } from "@/generated/prisma/enums";
import { getGoogleCalendarEventId } from "./event-id";
import { getGoogleCalendarEventPayload } from "./event-payload";

export async function syncGoogleCalendarEvent(
  calendarId: string,
  accessToken: string,
  target: GoogleCalendarSyncTarget,
  targetId: number,
): Promise<void> {
  const event = await getGoogleCalendarEventPayload(target, targetId);
  const eventId = getGoogleCalendarEventId(target, targetId);
  const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const eventUrl = `${eventsUrl}/${encodeURIComponent(eventId)}`;
  const headers = { Authorization: `Bearer ${accessToken}` };

  if (!event) {
    const response = await fetch(eventUrl, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(
        `Google Calendar event removal failed (HTTP ${response.status}).`,
      );
    }

    return;
  }

  const { id, ...eventFields } = event;
  const writeHeaders = { ...headers, "Content-Type": "application/json" };

  let response = await fetch(eventUrl, {
    method: "PATCH",
    headers: writeHeaders,
    body: JSON.stringify(eventFields),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) {
    response = await fetch(eventsUrl, {
      method: "POST",
      headers: writeHeaders,
      body: JSON.stringify({ id, ...eventFields }),
      signal: AbortSignal.timeout(10_000),
    });
  }

  if (!response.ok) {
    throw new Error(
      `Google Calendar event sync failed (HTTP ${response.status}).`,
    );
  }
}
