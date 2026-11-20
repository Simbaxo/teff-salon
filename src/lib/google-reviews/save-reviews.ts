import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { GoogleReviewsSnapshot } from "./fetch-reviews";

type SaveReviewsResult = {
  status: "synced" | "superseded";
  totalReviews: number;
  inserted: number;
  updated: number;
  deactivated: number;
};

export async function saveGoogleReviewsSnapshot(
  snapshot: GoogleReviewsSnapshot,
  locationName: string,
  fetchStartedAt: Date,
  leaseToken: string,
): Promise<SaveReviewsResult> {
  if (
    !/^locations\/\d+$/.test(locationName) ||
    !Number.isFinite(fetchStartedAt.getTime()) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      leaseToken,
    )
  ) {
    throw new Error("Invalid Google Reviews sync parameters.");
  }

  if (
    !Number.isInteger(snapshot.totalReviewCount) ||
    snapshot.totalReviewCount !== snapshot.reviews.length ||
    !Number.isFinite(snapshot.averageRating) ||
    snapshot.averageRating < 1 ||
    snapshot.averageRating > 5
  ) {
    throw new Error("Invalid Google Reviews snapshot.");
  }

  const reviewIds = snapshot.reviews.map((review) => review.googleReviewId);

  if (
    new Set(reviewIds).size !== reviewIds.length ||
    snapshot.reviews.some(
      (review) =>
        !review.googleReviewId ||
        !Number.isInteger(review.starRating) ||
        review.starRating < 1 ||
        review.starRating > 5 ||
        !Number.isFinite(review.publishedAt.getTime()) ||
        (review.googleUpdatedAt !== null &&
          !Number.isFinite(review.googleUpdatedAt.getTime())),
    )
  ) {
    throw new Error("Invalid or duplicate Google Reviews records.");
  }

  return prisma.$transaction(
    async (tx) => {
      // Serialize Google Reviews database writers.
      // This lock is separate from TEFF cashbox and payroll.
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtext('teff-google-reviews'),
          1
        )::text
      `;

      // Lock the lease row until this transaction commits or rolls back.
      // This prevents another worker from acquiring an expired lease
      // while the current worker is writing its review snapshot.
      const leaseRows = await tx.$queryRaw<
        Array<{
          syncLeaseToken: string | null;
          syncLeaseUntil: Date | null;
        }>
      >`
  SELECT
    "syncLeaseToken",
    "syncLeaseUntil"
  FROM "GoogleReviewsSyncState"
  WHERE "id" = 1
  FOR UPDATE
`;

      const lease = leaseRows[0];

      if (
        !lease ||
        lease.syncLeaseToken !== leaseToken ||
        !lease.syncLeaseUntil ||
        lease.syncLeaseUntil.getTime() <= Date.now()
      ) {
        throw new Error(
          "Google Reviews synchronization lease expired or changed.",
        );
      }

      const connection = await tx.googleReviewsConnection.findUnique({
        where: { id: 1 },
        select: { locationName: true },
      });

      if (connection?.locationName !== locationName) {
        throw new Error("Google Reviews location changed during sync.");
      }

      const previousState = await tx.googleReviewsSyncState.findUnique({
        where: { id: 1 },
        select: { lastSuccessfulSyncAt: true },
      });

      // Never overwrite a newer successful synchronization
      // with a snapshot fetched earlier.
      if (
        previousState?.lastSuccessfulSyncAt &&
        previousState.lastSuccessfulSyncAt >= fetchStartedAt
      ) {
        return {
          status: "superseded" as const,
          totalReviews: snapshot.totalReviewCount,
          inserted: 0,
          updated: 0,
          deactivated: 0,
        };
      }

      const now = new Date();

      // Fetch the existing reviews in one database query.
      const existingReviews = await tx.googleReview.findMany({
        where: {
          googleReviewId: { in: reviewIds },
        },
        select: {
          googleReviewId: true,
          reviewerName: true,
          starRating: true,
          comment: true,
          publishedAt: true,
          googleUpdatedAt: true,
        },
      });

      const existingById = new Map(
        existingReviews.map((review) => [review.googleReviewId, review]),
      );

      const newReviews: GoogleReviewsSnapshot["reviews"] = [];
      const changedReviews: GoogleReviewsSnapshot["reviews"] = [];

      // Compare Google's latest snapshot against stored data.
      for (const review of snapshot.reviews) {
        const existing = existingById.get(review.googleReviewId);

        if (!existing) {
          newReviews.push(review);
          continue;
        }

        const changed =
          existing.reviewerName !== review.reviewerName ||
          existing.starRating !== review.starRating ||
          existing.comment !== review.comment ||
          existing.publishedAt.getTime() !== review.publishedAt.getTime() ||
          (existing.googleUpdatedAt?.getTime() ?? null) !==
            (review.googleUpdatedAt?.getTime() ?? null);

        if (changed) {
          changedReviews.push(review);
        }
      }

      // Insert only reviews that are genuinely new.
      let inserted = 0;

      if (newReviews.length > 0) {
        const result = await tx.googleReview.createMany({
          data: newReviews.map((review) => ({
            googleReviewId: review.googleReviewId,
            reviewerName: review.reviewerName,
            starRating: review.starRating,
            comment: review.comment,
            publishedAt: review.publishedAt,
            googleUpdatedAt: review.googleUpdatedAt,
            isActive: true,
            firstSyncedAt: now,
            lastSeenAt: now,
          })),
          skipDuplicates: true,
        });

        inserted = result.count;
      }

      // Only update reviews whose actual content changed.
      for (const review of changedReviews) {
        await tx.googleReview.update({
          where: {
            googleReviewId: review.googleReviewId,
          },
          data: {
            reviewerName: review.reviewerName,
            starRating: review.starRating,
            comment: review.comment,
            publishedAt: review.publishedAt,
            googleUpdatedAt: review.googleUpdatedAt,
          },
        });
      }

      // Mark all reviews in the complete Google snapshot as seen.
      // This also reactivates any review that reappeared.
      // One bulk operation replaces hundreds of individual writes.
      if (reviewIds.length > 0) {
        await tx.googleReview.updateMany({
          where: {
            googleReviewId: { in: reviewIds },
          },
          data: {
            isActive: true,
            lastSeenAt: now,
          },
        });
      }

      // A review may be marked inactive ONLY after Google
      // successfully returned the complete validated snapshot.
      const deactivated = await tx.googleReview.updateMany({
        where: {
          isActive: true,
          googleReviewId: {
            notIn: reviewIds,
          },
        },
        data: {
          isActive: false,
        },
      });

      // Update Google's reported totals and synchronization status.
      // This is part of the same atomic transaction.
      await tx.googleReviewsSyncState.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          locationName,
          averageRating: snapshot.averageRating,
          totalReviewCount: snapshot.totalReviewCount,
          lastSyncAt: now,
          lastSuccessfulSyncAt: now,
          lastError: null,
        },
        update: {
          locationName,
          averageRating: snapshot.averageRating,
          totalReviewCount: snapshot.totalReviewCount,
          lastSyncAt: now,
          lastSuccessfulSyncAt: now,
          lastError: null,
        },
      });

      return {
        status: "synced" as const,
        totalReviews: snapshot.totalReviewCount,
        inserted,
        updated: changedReviews.length,
        deactivated: deactivated.count,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}
