import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { test } from "node:test";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";

test("Google Calendar worker persistence and recovery", async (t) => {
  getSafeTestDatabaseUrl();

  const { prisma } = await import("../../src/lib/prisma");

  const { processGoogleCalendarSyncJob } =
    await import("../../src/lib/google-calendar/process-job");

  const { queueGoogleCalendarSync } =
    await import("../../src/lib/google-calendar/queue");

  const fixtureIds: number[] = [];

  const successfulDependencies = {
    refreshAccessToken: async () => "mock-access-token",
    syncEvent: async () => {},
  };

  async function createJob(attempts = 0) {
    const job = await prisma.googleCalendarSyncJob.create({
      data: {
        target: "APPOINTMENT",
        targetId: randomInt(1_000_000_000, 2_000_000_000),
        attempts,
        nextRunAt: new Date(Date.now() - 60_000),
      },
    });

    fixtureIds.push(job.id);

    return job;
  }

  async function cleanupFixtures() {
    if (fixtureIds.length === 0) return;

    await prisma.googleCalendarSyncJob.deleteMany({
      where: {
        id: { in: fixtureIds },
      },
    });

    fixtureIds.length = 0;
  }

  try {
    assert.equal(
      await prisma.googleCalendarSyncJob.count(),
      0,
      "STOP: Development calendar queue must be empty.",
    );

    const connection = await prisma.googleCalendarConnection.findUnique({
      where: { id: 1 },
      select: { id: true },
    });

    assert.ok(connection, "STOP: Development calendar connection is required.");

    await t.test(
      "successful synchronization removes the queued job",
      async () => {
        const job = await createJob();

        const result = await processGoogleCalendarSyncJob(
          successfulDependencies,
        );

        assert.equal(result, "synced");

        assert.equal(
          await prisma.googleCalendarSyncJob.findUnique({
            where: { id: job.id },
          }),
          null,
        );

        await cleanupFixtures();
      },
    );

    await t.test("Google API failure persists a retry", async () => {
      const job = await createJob();
      const startedAt = Date.now();

      const result = await processGoogleCalendarSyncJob({
        ...successfulDependencies,
        syncEvent: async () => {
          throw new Error("Mock Google API failure");
        },
      });

      assert.equal(result, "retry_scheduled");

      const saved = await prisma.googleCalendarSyncJob.findUniqueOrThrow({
        where: { id: job.id },
      });

      assert.equal(saved.attempts, 1);
      assert.equal(saved.lockedUntil, null);
      assert.equal(saved.lastError, "Google Calendar sync failed.");

      assert.ok(saved.nextRunAt.getTime() >= startedAt + 60_000);

      await cleanupFixtures();
    });

    await t.test("OAuth refresh failure also persists a retry", async () => {
      const job = await createJob();
      let syncCalls = 0;

      const result = await processGoogleCalendarSyncJob({
        refreshAccessToken: async () => {
          throw new Error("Mock OAuth failure");
        },
        syncEvent: async () => {
          syncCalls++;
        },
      });

      assert.equal(result, "retry_scheduled");
      assert.equal(syncCalls, 0);

      const saved = await prisma.googleCalendarSyncJob.findUniqueOrThrow({
        where: { id: job.id },
      });

      assert.equal(saved.attempts, 1);
      assert.equal(saved.lockedUntil, null);

      await cleanupFixtures();
    });

    await t.test("retry backoff increases exponentially", async () => {
      const job = await createJob(3);
      const startedAt = Date.now();

      const result = await processGoogleCalendarSyncJob({
        ...successfulDependencies,
        syncEvent: async () => {
          throw new Error("Mock repeated failure");
        },
      });

      assert.equal(result, "retry_scheduled");

      const saved = await prisma.googleCalendarSyncJob.findUniqueOrThrow({
        where: { id: job.id },
      });

      assert.equal(saved.attempts, 4);

      assert.ok(saved.nextRunAt.getTime() >= startedAt + 480_000);

      assert.ok(saved.nextRunAt.getTime() <= Date.now() + 480_000);

      await cleanupFixtures();
    });

    await t.test("retry backoff is capped at one hour", async () => {
      const job = await createJob(10);
      const startedAt = Date.now();

      const result = await processGoogleCalendarSyncJob({
        ...successfulDependencies,
        syncEvent: async () => {
          throw new Error("Mock repeated failure");
        },
      });

      assert.equal(result, "retry_scheduled");

      const saved = await prisma.googleCalendarSyncJob.findUniqueOrThrow({
        where: { id: job.id },
      });

      assert.equal(saved.attempts, 11);

      assert.ok(saved.nextRunAt.getTime() >= startedAt + 3_600_000);

      assert.ok(saved.nextRunAt.getTime() <= Date.now() + 3_600_000);

      await cleanupFixtures();
    });

    await t.test(
      "a failed job can synchronize successfully later",
      async () => {
        const job = await createJob();

        const failed = await processGoogleCalendarSyncJob({
          ...successfulDependencies,
          syncEvent: async () => {
            throw new Error("Mock temporary failure");
          },
        });

        assert.equal(failed, "retry_scheduled");

        const prematureRetry = await processGoogleCalendarSyncJob(
          successfulDependencies,
        );

        assert.equal(prematureRetry, "idle");

        // Simulate the retry becoming eligible.
        await prisma.googleCalendarSyncJob.update({
          where: { id: job.id },
          data: {
            nextRunAt: new Date(Date.now() - 60_000),
          },
        });

        const recovered = await processGoogleCalendarSyncJob(
          successfulDependencies,
        );

        assert.equal(recovered, "synced");

        assert.equal(
          await prisma.googleCalendarSyncJob.findUnique({
            where: { id: job.id },
          }),
          null,
        );

        await cleanupFixtures();
      },
    );

    await t.test(
      "successful stale worker preserves a newer revision",
      async () => {
        const job = await createJob();

        const result = await processGoogleCalendarSyncJob({
          ...successfulDependencies,
          syncEvent: async () => {
            await prisma.$transaction(async (tx) => {
              await queueGoogleCalendarSync(tx, "APPOINTMENT", job.targetId);
            });
          },
        });

        assert.equal(result, "superseded");

        const saved = await prisma.googleCalendarSyncJob.findUniqueOrThrow({
          where: { id: job.id },
        });

        assert.equal(saved.revision, job.revision + 1);
        assert.equal(saved.attempts, 0);
        assert.equal(saved.lockedUntil, null);

        await cleanupFixtures();
      },
    );

    await t.test("failed stale worker preserves a newer revision", async () => {
      const job = await createJob();

      const result = await processGoogleCalendarSyncJob({
        ...successfulDependencies,
        syncEvent: async () => {
          await prisma.$transaction(async (tx) => {
            await queueGoogleCalendarSync(tx, "APPOINTMENT", job.targetId);
          });

          throw new Error("Mock stale worker failure");
        },
      });

      assert.equal(result, "superseded");

      const saved = await prisma.googleCalendarSyncJob.findUniqueOrThrow({
        where: { id: job.id },
      });

      assert.equal(saved.revision, job.revision + 1);
      assert.equal(saved.attempts, 0);
      assert.equal(saved.lockedUntil, null);
      assert.equal(saved.lastError, null);

      await cleanupFixtures();
    });

    assert.equal(
      await prisma.googleCalendarSyncJob.count(),
      0,
      "Calendar queue must be empty after testing.",
    );
  } finally {
    try {
      await cleanupFixtures();
    } finally {
      await prisma.$disconnect();
    }
  }
});
