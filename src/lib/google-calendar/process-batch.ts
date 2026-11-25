type JobResult =
  | "idle"
  | "disconnected"
  | "synced"
  | "retry_scheduled"
  | "superseded";

type BatchOptions = {
  maxJobs: number;
  maxRunTimeMs: number;
};

type BatchDependencies = {
  processJob: () => Promise<JobResult>;
  now: () => number;
};

export async function processGoogleCalendarSyncBatch(
  { maxJobs, maxRunTimeMs }: BatchOptions,
  dependencies?: BatchDependencies,
) {
  const processJob =
    dependencies?.processJob ??
    (await import("./process-job")).processGoogleCalendarSyncJob;

  const now = dependencies?.now ?? Date.now;
  const startedAt = now();

  const summary = {
    processed: 0,
    synced: 0,
    retryScheduled: 0,
    superseded: 0,
    result: "limit_reached" as
      | "idle"
      | "disconnected"
      | "limit_reached"
      | "time_limit",
  };

  for (let index = 0; index < maxJobs; index++) {
    if (now() - startedAt >= maxRunTimeMs) {
      summary.result = "time_limit";
      break;
    }

    const result = await processJob();

    if (result === "idle" || result === "disconnected") {
      summary.result = result;
      break;
    }

    summary.processed++;

    if (result === "synced") {
      summary.synced++;
    }

    if (result === "retry_scheduled") {
      summary.retryScheduled++;
    }

    if (result === "superseded") {
      summary.superseded++;
    }
  }

  return {
    ...summary,
    durationMs: now() - startedAt,
  };
}
