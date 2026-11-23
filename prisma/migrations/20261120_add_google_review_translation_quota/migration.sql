CREATE TABLE "GoogleReviewTranslationQuota" (
    "day" TEXT NOT NULL,
    "usedBytes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleReviewTranslationQuota_pkey" PRIMARY KEY ("day")
);
