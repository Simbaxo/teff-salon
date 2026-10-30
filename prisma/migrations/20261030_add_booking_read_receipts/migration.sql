
-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WEB', 'INTERNAL');

-- AlterTable
ALTER TABLE "Booking"
ADD COLUMN "source" "BookingSource";

-- CreateTable
CREATE TABLE "BookingReadReceipt" (
    "bookingId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingReadReceipt_pkey"
        PRIMARY KEY ("bookingId", "userId")
);

-- CreateIndex
CREATE INDEX "BookingReadReceipt_userId_readAt_idx"
ON "BookingReadReceipt"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "BookingReadReceipt"
ADD CONSTRAINT "BookingReadReceipt_bookingId_fkey"
FOREIGN KEY ("bookingId")
REFERENCES "Booking"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingReadReceipt"
ADD CONSTRAINT "BookingReadReceipt_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
