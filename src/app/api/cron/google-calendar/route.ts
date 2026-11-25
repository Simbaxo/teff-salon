import { timingSafeEqual } from "node:crypto";
import { processGoogleCalendarSyncBatch } from "@/lib/google-calendar/process-batch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_JOBS_PER_RUN = 20;
const MAX_RUN_TIME_MS = 25_000;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || !authorization) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(authorization);

  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };

  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  if (process.env.TEFF_GOOGLE_CALENDAR_SYNC_ENABLED !== "true") {
    return Response.json({ result: "disabled" }, { headers });
  }

  try {
    const summary = await processGoogleCalendarSyncBatch({
      maxJobs: MAX_JOBS_PER_RUN,
      maxRunTimeMs: MAX_RUN_TIME_MS,
    });

    return Response.json(summary, { headers });
  } catch (error) {
    console.error(
      "Google Calendar scheduled synchronization failed:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return Response.json(
      { error: "Google Calendar worker failed." },
      { status: 500, headers },
    );
  }
}
