-- CreateTable
CREATE TABLE "GoogleReviewsConnection" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "accountName" TEXT,
    "locationName" TEXT,
    "encryptedRefreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleReviewsConnection_pkey" PRIMARY KEY ("id")
);

