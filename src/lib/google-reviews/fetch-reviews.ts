export type GoogleReviewRecord = {
  googleReviewId: string;
  reviewerName: string | null;
  starRating: number;
  comment: string | null;
  publishedAt: Date;
  googleUpdatedAt: Date | null;
};

export type GoogleReviewsSnapshot = {
  reviews: GoogleReviewRecord[];
  averageRating: number;
  totalReviewCount: number;
};

type GoogleApiReview = {
  reviewId?: string;
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewer?: {
    displayName?: string;
    isAnonymous?: boolean;
  };
};

type GoogleApiResponse = {
  reviews?: GoogleApiReview[];
  averageRating?: number;
  totalReviewCount?: number;
  nextPageToken?: string;
};

const RATING_VALUES: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export async function fetchGoogleReviewsSnapshot(
  accessToken: string,
  accountName: string,
  locationName: string,
): Promise<GoogleReviewsSnapshot> {
  if (
    !/^accounts\/\d+$/.test(accountName) ||
    !/^locations\/\d+$/.test(locationName)
  ) {
    throw new Error("Invalid Google Business Profile identifiers.");
  }

  const reviews: GoogleReviewRecord[] = [];
  const seenReviewIds = new Set<string>();
  const seenPageTokens = new Set<string>();

  let pageToken: string | undefined;
  let averageRating: number | undefined;
  let totalReviewCount: number | undefined;

  for (let page = 0; page < 100; page++) {
    const url = new URL(
      `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews`,
    );

    url.searchParams.set("pageSize", "50");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`Google Reviews fetch failed (HTTP ${response.status}).`);
    }

    const data = (await response.json()) as GoogleApiResponse;

    if (
      typeof data.totalReviewCount !== "number" ||
      !Number.isInteger(data.totalReviewCount) ||
      data.totalReviewCount < 0 ||
      typeof data.averageRating !== "number" ||
      !Number.isFinite(data.averageRating) ||
      data.averageRating < 1 ||
      data.averageRating > 5
    ) {
      throw new Error("Google Reviews response has invalid totals.");
    }

    totalReviewCount ??= data.totalReviewCount;
    averageRating ??= data.averageRating;

    if (
      totalReviewCount !== data.totalReviewCount ||
      Math.abs(averageRating - data.averageRating) > 0.00001
    ) {
      throw new Error("Google Reviews totals changed during pagination.");
    }

    if (data.reviews !== undefined && !Array.isArray(data.reviews)) {
      throw new Error("Google Reviews response has invalid review records.");
    }

    for (const review of data.reviews ?? []) {
      if (
        !review.reviewId ||
        !review.createTime ||
        !Object.hasOwn(RATING_VALUES, review.starRating ?? "")
      ) {
        throw new Error("Google returned an invalid review.");
      }

      const publishedAt = new Date(review.createTime);
      const googleUpdatedAt = review.updateTime
        ? new Date(review.updateTime)
        : null;

      if (
        !Number.isFinite(publishedAt.getTime()) ||
        (googleUpdatedAt !== null &&
          !Number.isFinite(googleUpdatedAt.getTime()))
      ) {
        throw new Error("Google returned an invalid review timestamp.");
      }

      if (seenReviewIds.has(review.reviewId)) {
        throw new Error("Google returned a duplicate review ID.");
      }

      seenReviewIds.add(review.reviewId);

      reviews.push({
        googleReviewId: review.reviewId,
        reviewerName: review.reviewer?.isAnonymous
          ? null
          : (review.reviewer?.displayName ?? null),
        starRating: RATING_VALUES[review.starRating!],
        comment: review.comment ?? null,
        publishedAt,
        googleUpdatedAt,
      });
    }

    if (!data.nextPageToken) {
      if (reviews.length !== totalReviewCount) {
        throw new Error(
          "Google Reviews pagination count does not match the reported total.",
        );
      }

      return {
        reviews,
        averageRating,
        totalReviewCount,
      };
    }

    if (seenPageTokens.has(data.nextPageToken)) {
      throw new Error("Google returned a repeated pagination token.");
    }

    seenPageTokens.add(data.nextPageToken);
    pageToken = data.nextPageToken;
  }

  throw new Error("Google Reviews pagination exceeded the safety limit.");
}
