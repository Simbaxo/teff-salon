import { timingSafeEqual } from "node:crypto";
import { processGoogleCalendarSyncJob } from "@/lib/google-calendar/process-job";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const result = await processGoogleCalendarSyncJob();
    return Response.json({ result }, { headers });
  } catch {
    return Response.json(
      { error: "Google Calendar worker failed." },
      { status: 500, headers },
    );
  }
}
