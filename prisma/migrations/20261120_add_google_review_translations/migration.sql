ALTER TABLE "GoogleReview"
  ADD COLUMN "commentEs" TEXT,
  ADD COLUMN "translationSourceHash" TEXT,
  ADD COLUMN "translatedAt" TIMESTAMP(3);
