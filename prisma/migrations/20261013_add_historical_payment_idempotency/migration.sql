-- AlterTable
ALTER TABLE "PayrollHistoricalPayment" ADD COLUMN     "idempotencyKey" TEXT NOT NULL,
ADD COLUMN     "paymentReference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PayrollHistoricalPayment_idempotencyKey_key" ON "PayrollHistoricalPayment"("idempotencyKey");
