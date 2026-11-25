import { prisma } from "@/lib/prisma";
import { refreshGoogleCalendarAccessToken } from "./access-token";
import { claimGoogleCalendarSyncJob } from "./claim-job";
import { syncGoogleCalendarEvent } from "./sync-event";

type JobDependencies = {
  refreshAccessToken: typeof refreshGoogleCalendarAccessToken;
  syncEvent: typeof syncGoogleCalendarEvent;
};

export async function processGoogleCalendarSyncJob(
  dependencies?: JobDependencies,
) {
  const refreshAccessToken =
    dependencies?.refreshAccessToken ?? refreshGoogleCalendarAccessToken;

  const syncEvent = dependencies?.syncEvent ?? syncGoogleCalendarEvent;

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { id: 1 },
    select: {
      calendarId: true,
      encryptedRefreshToken: true,
    },
  });

  if (!connection) return "disconnected";

  const job = await claimGoogleCalendarSyncJob();

  if (!job) return "idle";

  const lease = {
    id: job.id,
    lockedUntil: job.lockedUntil,
  };

  const claimedRevision = {
    ...lease,
    revision: job.revision,
  };

  try {
    const accessToken = await refreshAccessToken(
      connection.encryptedRefreshToken,
    );

    await syncEvent(
      connection.calendarId,
      accessToken,
      job.target,
      job.targetId,
    );
  } catch {
    const retryDelaySeconds = Math.min(60 * 2 ** job.attempts, 3600);

    const result = await prisma.googleCalendarSyncJob.updateMany({
      where: claimedRevision,
      data: {
        attempts: { increment: 1 },
        nextRunAt: new Date(Date.now() + retryDelaySeconds * 1000),
        lockedUntil: null,
        lastError: "Google Calendar sync failed.",
      },
    });

    if (result.count === 1) {
      return "retry_scheduled";
    }

    // Release this lease if a newer revision arrived during the attempt.
    await prisma.googleCalendarSyncJob.updateMany({
      where: lease,
      data: { lockedUntil: null },
    });

    return "superseded";
  }

  const result = await prisma.googleCalendarSyncJob.deleteMany({
    where: claimedRevision,
  });

  if (result.count === 1) {
    return "synced";
  }

  // Keep the newer revision available for the next run.
  await prisma.googleCalendarSyncJob.updateMany({
    where: lease,
    data: { lockedUntil: null },
  });

  return "superseded";
}
