import type { GoogleCalendarSyncJob } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type ClaimedJob = Pick<
  GoogleCalendarSyncJob,
  "id" | "target" | "targetId" | "revision" | "attempts" | "lockedUntil"
>;

export async function claimGoogleCalendarSyncJob(): Promise<ClaimedJob | null> {
  const [job] = await prisma.$queryRaw<ClaimedJob[]>`
    WITH pending_job AS (
      SELECT "id"
      FROM "GoogleCalendarSyncJob"
      WHERE "nextRunAt" <= CURRENT_TIMESTAMP
        AND ("lockedUntil" IS NULL OR "lockedUntil" <= CURRENT_TIMESTAMP)
      ORDER BY "nextRunAt", "id"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "GoogleCalendarSyncJob" AS job
    SET "lockedUntil" = CURRENT_TIMESTAMP + INTERVAL '2 minutes',
        "updatedAt" = CURRENT_TIMESTAMP
    FROM pending_job
    WHERE job."id" = pending_job."id"
    RETURNING job."id", job."target", job."targetId", job."revision",
              job."attempts", job."lockedUntil"
  `;

  return job ?? null;
}
