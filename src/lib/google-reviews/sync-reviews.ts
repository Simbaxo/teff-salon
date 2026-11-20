import { prisma } from "@/lib/prisma";
import { refreshGoogleReviewsAccessToken } from "./access-token";
import { fetchGoogleReviewsSnapshot } from "./fetch-reviews";
import { saveGoogleReviewsSnapshot } from "./save-reviews";
import {
  acquireGoogleReviewsSyncLease,
  releaseGoogleReviewsSyncLease,
} from "./sync-lease";

type SyncGoogleReviewsResult =
  | {
      status: "already_running";
      totalReviews: number;
      inserted: number;
      updated: number;
      deactivated: number;
    }
  | Awaited<ReturnType<typeof saveGoogleReviewsSnapshot>>;

export async function syncGoogleReviews(): Promise<SyncGoogleReviewsResult> {
  // Acquire the lease before making any Google API requests.
  const leaseToken = await acquireGoogleReviewsSyncLease();

  if (!leaseToken) {
    return {
      status: "already_running",
      totalReviews: 0,
      inserted: 0,
      updated: 0,
      deactivated: 0,
    };
  }

  try {
    const connection = await prisma.googleReviewsConnection.findUnique({
      where: { id: 1 },
      select: {
        accountName: true,
        locationName: true,
        encryptedRefreshToken: true,
      },
    });

    if (!connection?.accountName || !connection.locationName) {
      throw new Error("Google Reviews connection is incomplete.");
    }

    // Record when this worker starts fetching Google's review snapshot.
    const fetchStartedAt = new Date();

    const accessToken = await refreshGoogleReviewsAccessToken(
      connection.encryptedRefreshToken,
    );

    const snapshot = await fetchGoogleReviewsSnapshot(
      accessToken,
      connection.accountName,
      connection.locationName,
    );

    // The importer verifies this worker still owns an unexpired
    // lease inside its database transaction before changing data.
    return await saveGoogleReviewsSnapshot(
      snapshot,
      connection.locationName,
      fetchStartedAt,
      leaseToken,
    );
  } finally {
    // Release only the lease belonging to this worker.
    // An expired worker cannot release a replacement worker's lease.
    await releaseGoogleReviewsSyncLease(leaseToken);
  }
}
