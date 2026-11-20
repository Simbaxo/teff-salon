-- AlterTable
ALTER TABLE "GoogleReviewsSyncState" ADD COLUMN     "syncLeaseToken" TEXT,
ADD COLUMN     "syncLeaseUntil" TIMESTAMP(3);

