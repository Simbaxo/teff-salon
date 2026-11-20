import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const LEASE_DURATION_MS = 3 * 60 * 1000;

export async function acquireGoogleReviewsSyncLease(): Promise<string | null> {
  const token = randomUUID();
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_DURATION_MS);

  // Ensure the singleton row exists without overwriting existing statistics.
  await prisma.googleReviewsSyncState.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  // Only one request can claim an expired or available lease.
  const result = await prisma.googleReviewsSyncState.updateMany({
    where: {
      id: 1,
      OR: [{ syncLeaseUntil: null }, { syncLeaseUntil: { lte: now } }],
    },
    data: {
      syncLeaseToken: token,
      syncLeaseUntil: leaseUntil,
    },
  });

  return result.count === 1 ? token : null;
}

export async function releaseGoogleReviewsSyncLease(
  token: string,
): Promise<boolean> {
  // Prevent an old worker from clearing a newer worker's lease.
  const result = await prisma.googleReviewsSyncState.updateMany({
    where: {
      id: 1,
      syncLeaseToken: token,
    },
    data: {
      syncLeaseToken: null,
      syncLeaseUntil: null,
    },
  });

  return result.count === 1;
}
