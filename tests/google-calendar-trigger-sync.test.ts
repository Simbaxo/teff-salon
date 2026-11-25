import assert from "node:assert/strict";
import { test } from "node:test";
import { triggerGoogleCalendarSync } from "../src/lib/google-calendar/trigger-sync";

test("does not schedule synchronization when disabled", () => {
  let scheduled = 0;
  let processed = 0;

  triggerGoogleCalendarSync({
    isEnabled: () => false,
    schedule: () => {
      scheduled++;
    },
    processBatch: async () => {
      processed++;
    },
  });

  assert.equal(scheduled, 0);
  assert.equal(processed, 0);
});

test("schedules background synchronization when enabled", () => {
  let scheduled = 0;

  triggerGoogleCalendarSync({
    isEnabled: () => true,
    schedule: () => {
      scheduled++;
    },
    processBatch: async () => {},
  });

  assert.equal(scheduled, 1);
});

test("does not process jobs before the scheduled callback runs", async () => {
  const callbacks: Array<() => Promise<void>> = [];
  let processed = 0;

  triggerGoogleCalendarSync({
    isEnabled: () => true,
    schedule: (callback) => {
      callbacks.push(callback);
    },
    processBatch: async () => {
      processed++;
    },
  });

  assert.equal(callbacks.length, 1);
  assert.equal(processed, 0);

  await callbacks[0]();

  assert.equal(processed, 1);
});

test("uses the expected background batch limits", async () => {
  const callbacks: Array<() => Promise<void>> = [];
  const receivedOptions: unknown[] = [];

  triggerGoogleCalendarSync({
    isEnabled: () => true,
    schedule: (callback) => {
      callbacks.push(callback);
    },
    processBatch: async (options) => {
      receivedOptions.push(options);
    },
  });

  await callbacks[0]();

  assert.deepEqual(receivedOptions, [
    {
      maxJobs: 10,
      maxRunTimeMs: 20_000,
    },
  ]);
});

test("scheduler failures do not propagate to the caller", (t) => {
  const logger = t.mock.method(console, "error", () => {});
  let processed = 0;

  assert.doesNotThrow(() => {
    triggerGoogleCalendarSync({
      isEnabled: () => true,
      schedule: () => {
        throw new Error("Mock scheduler failure");
      },
      processBatch: async () => {
        processed++;
      },
    });
  });

  assert.equal(processed, 0);
  assert.equal(logger.mock.callCount(), 1);
});

test("background processing failures do not propagate", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const callbacks: Array<() => Promise<void>> = [];

  triggerGoogleCalendarSync({
    isEnabled: () => true,
    schedule: (callback) => {
      callbacks.push(callback);
    },
    processBatch: async () => {
      throw new Error("Mock synchronization failure");
    },
  });

  await assert.doesNotReject(callbacks[0]);
  assert.equal(logger.mock.callCount(), 1);
});

test("background trigger returns without waiting for processing", () => {
  const callbacks: Array<() => Promise<void>> = [];

  const result = triggerGoogleCalendarSync({
    isEnabled: () => true,
    schedule: (callback) => {
      callbacks.push(callback);
    },
    processBatch: async () => {},
  });

  assert.equal(result, undefined);
  assert.equal(callbacks.length, 1);
});
