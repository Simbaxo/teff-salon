-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "internalRequestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_internalRequestKey_key" ON "Booking"("internalRequestKey");
