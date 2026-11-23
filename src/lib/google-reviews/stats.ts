import { prisma } from "@/lib/prisma";
import {
  getTeffToday,
  getTeffDayStart,
  getTeffDayOfWeek,
  addTeffDays,
} from "@/lib/datetime";
import { getCachedSpanishTranslation } from "./translation-cache";

const MONTHLY_REVIEW_GOAL = 30;
const MINIMUM_MONTHLY_RATING = 4.8;

function summarizeRatings(reviews: { starRating: number }[]) {
  const count = reviews.length;

  const sum = reviews.reduce((total, review) => total + review.starRating, 0);

  const average = count > 0 ? sum / count : null;

  const breakdown = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: reviews.filter((review) => review.starRating === stars).length,
  }));

  return { count, average, breakdown };
}

export async function getGoogleReviewsDashboardStats() {
  const today = getTeffToday();

  // Current calendar month in Medellin.
  const monthStartDate = `${today.slice(0, 7)}-01`;
  const [year, month] = today.split("-").map(Number);

  const nextMonthDate = new Date(Date.UTC(year, month, 1))
    .toISOString()
    .slice(0, 10);

  const monthStart = getTeffDayStart(monthStartDate);
  const monthEnd = getTeffDayStart(nextMonthDate);

  // Current Monday-Sunday week in Medellin.
  const dayOfWeek = getTeffDayOfWeek(today);
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const weekStartDate = addTeffDays(today, -daysSinceMonday);

  const weekEndDate = addTeffDays(weekStartDate, 7);

  const weekStart = getTeffDayStart(weekStartDate);
  const weekEnd = getTeffDayStart(weekEndDate);

  const [monthlyReviews, weeklyReviews, recentReviews, syncState] =
    await Promise.all([
      prisma.googleReview.findMany({
        where: {
          isActive: true,
          publishedAt: {
            gte: monthStart,
            lt: monthEnd,
          },
        },
        select: { starRating: true },
      }),

      prisma.googleReview.findMany({
        where: {
          isActive: true,
          publishedAt: {
            gte: weekStart,
            lt: weekEnd,
          },
        },
        select: { starRating: true },
      }),

      prisma.googleReview.findMany({
        where: { isActive: true },
        // Show recently edited reviews as well as newly published ones.
        orderBy: [
          { googleUpdatedAt: "desc" },
          { publishedAt: "desc" },
          { id: "desc" },
        ],
        take: 30,
        select: {
          id: true,
          reviewerName: true,
          starRating: true,
          comment: true,
          commentEs: true,
          translationSourceHash: true,
          publishedAt: true,
        },
      }),

      prisma.googleReviewsSyncState.findUnique({
        where: { id: 1 },
        select: {
          averageRating: true,
          totalReviewCount: true,
          lastSuccessfulSyncAt: true,
          lastError: true,
        },
      }),
    ]);

  const monthly = summarizeRatings(monthlyReviews);
  const weekly = summarizeRatings(weeklyReviews);

  const monthlyGoalAchieved =
    monthly.count >= MONTHLY_REVIEW_GOAL &&
    monthly.average !== null &&
    monthly.average >= MINIMUM_MONTHLY_RATING;

  return {
    today,
    monthStartDate,
    weekStartDate,

    monthly: {
      ...monthly,
      goal: MONTHLY_REVIEW_GOAL,
      minimumAverage: MINIMUM_MONTHLY_RATING,
      progress: Math.min((monthly.count / MONTHLY_REVIEW_GOAL) * 100, 100),
      goalAchieved: monthlyGoalAchieved,
    },

    weekly,
    recentReviews: recentReviews.map((review) => ({
      id: review.id,
      reviewerName: review.reviewerName,
      starRating: review.starRating,
      comment: review.comment,
      publishedAt: review.publishedAt,
      translation: getCachedSpanishTranslation(review),
    })),

    overall: {
      averageRating: syncState?.averageRating ?? null,
      totalReviewCount: syncState?.totalReviewCount ?? null,
    },

    sync: {
      lastSuccessfulSyncAt: syncState?.lastSuccessfulSyncAt ?? null,
      lastError: syncState?.lastError ?? null,
    },
  };
}
