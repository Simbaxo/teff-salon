-- CreateTable
CREATE TABLE "WeeklySalesReview" (
    "id" SERIAL NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "reviewedById" INTEGER NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salesCount" INTEGER NOT NULL,
    "salesTotal" INTEGER NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklySalesReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySalesReview_weekStart_key" ON "WeeklySalesReview"("weekStart");

-- CreateIndex
CREATE INDEX "WeeklySalesReview_reviewedById_idx" ON "WeeklySalesReview"("reviewedById");

-- AddForeignKey
ALTER TABLE "WeeklySalesReview" ADD CONSTRAINT "WeeklySalesReview_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
