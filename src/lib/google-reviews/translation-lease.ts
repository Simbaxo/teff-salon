import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

const TRANSLATION_LEASE_MS = 30_000;

/**
 * Acquire an exclusive, temporary translation lease.
 *
 * PostgreSQL ensures only one request can successfully
 * acquire the same review's lease at a time.
 */
export async function acquireReviewTranslationLease(
  reviewId: number,
): Promise<string | null> {
  const now = new Date();
  const token = randomUUID();

  const result = await prisma.googleReview.updateMany({
    where: {
      id: reviewId,
      isActive: true,
      OR: [
        { translationLeaseToken: null },
        { translationLeaseUntil: null },
        { translationLeaseUntil: { lte: now } },
      ],
    },
    data: {
      translationLeaseToken: token,
      translationLeaseUntil: new Date(now.getTime() + TRANSLATION_LEASE_MS),
    },
  });

  return result.count === 1 ? token : null;
}

/**
 * Release only the lease owned by this request.
 *
 * An expired worker cannot release a newer worker's
 * replacement lease.
 */
export async function releaseReviewTranslationLease(
  reviewId: number,
  token: string,
): Promise<void> {
  await prisma.googleReview.updateMany({
    where: {
      id: reviewId,
      translationLeaseToken: token,
    },
    data: {
      translationLeaseToken: null,
      translationLeaseUntil: null,
    },
  });
}
