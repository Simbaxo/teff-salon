import assert from "node:assert/strict";
import { test } from "node:test";
import { processGoogleCalendarSyncBatch } from "../src/lib/google-calendar/process-batch";

type JobResult =
  | "idle"
  | "disconnected"
  | "synced"
  | "retry_scheduled"
  | "superseded";

const defaultOptions = {
  maxJobs: 10,
  maxRunTimeMs: 20_000,
};

function createMockWorker(results: JobResult[]) {
  let calls = 0;

  return {
    processJob: async (): Promise<JobResult> => {
      return results[calls++] ?? "idle";
    },
    getCalls: () => calls,
  };
}

test("stops immediately when the queue is empty", async () => {
  const worker = createMockWorker(["idle"]);

  const result = await processGoogleCalendarSyncBatch(defaultOptions, {
    processJob: worker.processJob,
    now: () => 0,
  });

  assert.equal(result.result, "idle");
  assert.equal(result.processed, 0);
  assert.equal(worker.getCalls(), 1);
});

test("stops when Google Calendar is disconnected", async () => {
  const worker = createMockWorker(["disconnected"]);

  const result = await processGoogleCalendarSyncBatch(defaultOptions, {
    processJob: worker.processJob,
    now: () => 0,
  });

  assert.equal(result.result, "disconnected");
  assert.equal(result.processed, 0);
  assert.equal(worker.getCalls(), 1);
});

test("counts successfully synchronized jobs", async () => {
  const worker = createMockWorker(["synced", "synced", "synced", "idle"]);

  const result = await processGoogleCalendarSyncBatch(defaultOptions, {
    processJob: worker.processJob,
    now: () => 0,
  });

  assert.equal(result.processed, 3);
  assert.equal(result.synced, 3);
  assert.equal(result.retryScheduled, 0);
  assert.equal(result.result, "idle");
  assert.equal(worker.getCalls(), 4);
});

test("counts failed jobs scheduled for retry", async () => {
  const worker = createMockWorker(["retry_scheduled", "synced", "idle"]);

  const result = await processGoogleCalendarSyncBatch(defaultOptions, {
    processJob: worker.processJob,
    now: () => 0,
  });

  assert.equal(result.processed, 2);
  assert.equal(result.synced, 1);
  assert.equal(result.retryScheduled, 1);
  assert.equal(result.result, "idle");
});

test("counts superseded job revisions", async () => {
  const worker = createMockWorker(["superseded", "synced", "idle"]);

  const result = await processGoogleCalendarSyncBatch(defaultOptions, {
    processJob: worker.processJob,
    now: () => 0,
  });

  assert.equal(result.processed, 2);
  assert.equal(result.superseded, 1);
  assert.equal(result.synced, 1);
});

test("respects the maximum job limit", async () => {
  const worker = createMockWorker(Array<JobResult>(15).fill("synced"));

  const result = await processGoogleCalendarSyncBatch(defaultOptions, {
    processJob: worker.processJob,
    now: () => 0,
  });

  assert.equal(result.processed, 10);
  assert.equal(result.synced, 10);
  assert.equal(result.result, "limit_reached");
  assert.equal(worker.getCalls(), 10);
});

test("supports larger fallback cron batches", async () => {
  const worker = createMockWorker(Array<JobResult>(30).fill("synced"));

  const result = await processGoogleCalendarSyncBatch(
    {
      maxJobs: 20,
      maxRunTimeMs: 25_000,
    },
    {
      processJob: worker.processJob,
      now: () => 0,
    },
  );

  assert.equal(result.processed, 20);
  assert.equal(result.synced, 20);
  assert.equal(result.result, "limit_reached");
  assert.equal(worker.getCalls(), 20);
});

test("stops starting new jobs after the soft time limit", async () => {
  let currentTime = 0;
  let calls = 0;

  const result = await processGoogleCalendarSyncBatch(defaultOptions, {
    processJob: async () => {
      calls++;
      currentTime += 11_000;
      return "synced";
    },
    now: () => currentTime,
  });

  assert.equal(result.processed, 2);
  assert.equal(result.synced, 2);
  assert.equal(result.result, "time_limit");
  assert.equal(result.durationMs, 22_000);
  assert.equal(calls, 2);
});

test("correctly summarizes mixed job results", async () => {
  const worker = createMockWorker([
    "synced",
    "retry_scheduled",
    "superseded",
    "synced",
    "idle",
  ]);

  const result = await processGoogleCalendarSyncBatch(defaultOptions, {
    processJob: worker.processJob,
    now: () => 0,
  });

  assert.deepEqual(result, {
    processed: 4,
    synced: 2,
    retryScheduled: 1,
    superseded: 1,
    result: "idle",
    durationMs: 0,
  });
});

test("propagates unexpected worker errors", async () => {
  await assert.rejects(
    () =>
      processGoogleCalendarSyncBatch(defaultOptions, {
        processJob: async () => {
          throw new Error("Unexpected worker failure");
        },
        now: () => 0,
      }),
    /Unexpected worker failure/,
  );
});
