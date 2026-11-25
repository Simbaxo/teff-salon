import { after } from "next/server";
import { processGoogleCalendarSyncBatch } from "./process-batch";

const MAX_JOBS_PER_RUN = 10;
const MAX_RUN_TIME_MS = 20_000;

type TriggerDependencies = {
  schedule: (callback: () => Promise<void>) => void;
  processBatch: (options: {
    maxJobs: number;
    maxRunTimeMs: number;
  }) => Promise<unknown>;
  isEnabled: () => boolean;
};

export function triggerGoogleCalendarSync(
  dependencies?: TriggerDependencies,
): void {
  const isEnabled =
    dependencies?.isEnabled ??
    (() => process.env.TEFF_GOOGLE_CALENDAR_SYNC_ENABLED === "true");

  if (!isEnabled()) {
    return;
  }

  const schedule = dependencies?.schedule ?? after;
  const processBatch =
    dependencies?.processBatch ?? processGoogleCalendarSyncBatch;

  try {
    schedule(async () => {
      try {
        await processBatch({
          maxJobs: MAX_JOBS_PER_RUN,
          maxRunTimeMs: MAX_RUN_TIME_MS,
        });
      } catch (error) {
        console.error(
          "Google Calendar background synchronization failed:",
          error instanceof Error ? error.name : "Unknown error",
        );
      }
    });
  } catch (error) {
    console.error(
      "Google Calendar background scheduling failed:",
      error instanceof Error ? error.name : "Unknown error",
    );
  }
}
