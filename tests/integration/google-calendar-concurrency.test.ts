import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { test } from "node:test";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";

test("Google Calendar queue concurrency and recovery", async (t) => {
  // Validate the database before importing the real Prisma client.
  getSafeTestDatabaseUrl();

  const { prisma } = await import("../../src/lib/prisma");
  const { claimGoogleCalendarSyncJob } =
    await import("../../src/lib/google-calendar/claim-job");
  const { queueGoogleCalendarSync } =
    await import("../../src/lib/google-calendar/queue");

  const fixtureIds: number[] = [];

  async function createJob(
    options: {
      nextRunAt?: Date;
      lockedUntil?: Date | null;
      attempts?: number;
    } = {},
  ) {
    const job = await prisma.googleCalendarSyncJob.create({
      data: {
        target: "APPOINTMENT",
        targetId: randomInt(1_000_000_000, 2_000_000_000),
        nextRunAt: new Date(Date.now() - 60_000),
        ...options,
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
    // Never claim unrelated jobs from a populated queue.
    assert.equal(
      await prisma.googleCalendarSyncJob.count(),
      0,
      "STOP: Development calendar queue must be empty.",
    );

    await t.test("concurrent workers cannot claim the same job", async () => {
      const job = await createJob();

      const results = await Promise.all([
        claimGoogleCalendarSyncJob(),
        claimGoogleCalendarSyncJob(),
      ]);

      const claimed = results.filter((result) => result !== null);

      assert.equal(claimed.length, 1);
      assert.equal(claimed[0]?.id, job.id);

      const saved = await prisma.googleCalendarSyncJob.findUniqueOrThrow({
        where: { id: job.id },
      });

      assert.ok(saved.lockedUntil);
      assert.ok(saved.lockedUntil.getTime() > Date.now());

      await cleanupFixtures();
    });

    await t.test("workers skip an actively leased job", async () => {
      await createJob({
        lockedUntil: new Date(Date.now() + 120_000),
      });

      const result = await claimGoogleCalendarSyncJob();

      assert.equal(result, null);

      await cleanupFixtures();
    });

    await t.test("expired leases allow jobs to be recovered", async () => {
      const job = await createJob({
        lockedUntil: new Date(Date.now() - 60_000),
      });

      const result = await claimGoogleCalendarSyncJob();

      assert.equal(result?.id, job.id);
      assert.ok(result?.lockedUntil);
      assert.ok(result.lockedUntil.getTime() > Date.now());

      await cleanupFixtures();
    });

    await t.test("future retry jobs are not claimed prematurely", async () => {
      await createJob({
        nextRunAt: new Date(Date.now() + 600_000),
        attempts: 2,
      });

      const result = await claimGoogleCalendarSyncJob();

      assert.equal(result, null);

      await cleanupFixtures();
    });

    await t.test("concurrent workers claim separate pending jobs", async () => {
      const first = await createJob();
      const second = await createJob();

      const results = await Promise.all([
        claimGoogleCalendarSyncJob(),
        claimGoogleCalendarSyncJob(),
        claimGoogleCalendarSyncJob(),
      ]);

      const claimedIds = results
        .filter((result) => result !== null)
        .map((result) => result.id)
        .sort((a, b) => a - b);

      assert.deepEqual(
        claimedIds,
        [first.id, second.id].sort((a, b) => a - b),
      );

      await cleanupFixtures();
    });

    await t.test("queue updates preserve newer revisions", async () => {
      const job = await createJob({
        attempts: 3,
      });

      const claimed = await claimGoogleCalendarSyncJob();

      assert.ok(claimed);
      assert.equal(claimed.id, job.id);

      await prisma.$transaction(async (tx) => {
        await queueGoogleCalendarSync(tx, "APPOINTMENT", job.targetId);
      });

      const updated = await prisma.googleCalendarSyncJob.findUniqueOrThrow({
        where: { id: job.id },
      });

      assert.equal(updated.revision, claimed.revision + 1);
      assert.equal(updated.attempts, 0);
      assert.equal(updated.lastError, null);

      // A stale worker must not delete the newer revision.
      const deletion = await prisma.googleCalendarSyncJob.deleteMany({
        where: {
          id: claimed.id,
          revision: claimed.revision,
          lockedUntil: claimed.lockedUntil,
        },
      });

      assert.equal(deletion.count, 0);

      const preserved = await prisma.googleCalendarSyncJob.findUnique({
        where: { id: job.id },
      });

      assert.ok(preserved);

      await cleanupFixtures();
    });

    await t.test(
      "rolled-back transactions do not leave queued jobs",
      async () => {
        const targetId = randomInt(1_000_000_000, 2_000_000_000);

        assert.equal(
          await prisma.googleCalendarSyncJob.count({
            where: {
              target: "APPOINTMENT",
              targetId,
            },
          }),
          0,
        );

        await assert.rejects(
          () =>
            prisma.$transaction(async (tx) => {
              await queueGoogleCalendarSync(tx, "APPOINTMENT", targetId);

              throw new Error("Intentional test rollback");
            }),
          /Intentional test rollback/,
        );

        assert.equal(
          await prisma.googleCalendarSyncJob.count({
            where: {
              target: "APPOINTMENT",
              targetId,
            },
          }),
          0,
        );
      },
    );

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
