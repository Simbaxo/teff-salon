-- CreateTable
CREATE TABLE "GoogleReview" (
    "id" SERIAL NOT NULL,
    "googleReviewId" TEXT NOT NULL,
    "reviewerName" TEXT,
    "starRating" INTEGER NOT NULL,
    "comment" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "googleUpdatedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "firstSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleReviewsSyncState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "locationName" TEXT,
    "averageRating" DOUBLE PRECISION,
    "totalReviewCount" INTEGER,
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleReviewsSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleReview_googleReviewId_key" ON "GoogleReview"("googleReviewId");

-- CreateIndex
CREATE INDEX "GoogleReview_publishedAt_idx" ON "GoogleReview"("publishedAt");

-- CreateIndex
CREATE INDEX "GoogleReview_isActive_publishedAt_idx" ON "GoogleReview"("isActive", "publishedAt");

