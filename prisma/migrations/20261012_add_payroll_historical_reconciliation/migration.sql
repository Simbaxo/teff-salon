-- CreateEnum
CREATE TYPE "PayrollReconciliationStatus" AS ENUM ('NOT_RECONCILED', 'PARTIALLY_RECONCILED', 'SETTLED');

-- AlterTable
ALTER TABLE "PayrollPeriod" ADD COLUMN     "reconciledAt" TIMESTAMP(3),
ADD COLUMN     "reconciliationStatus" "PayrollReconciliationStatus" NOT NULL DEFAULT 'NOT_RECONCILED';

-- CreateTable
CREATE TABLE "PayrollHistoricalPayment" (
    "id" SERIAL NOT NULL,
    "payrollEntryId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollHistoricalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayrollHistoricalPayment_payrollEntryId_idx" ON "PayrollHistoricalPayment"("payrollEntryId");

-- CreateIndex
CREATE INDEX "PayrollHistoricalPayment_paymentDate_idx" ON "PayrollHistoricalPayment"("paymentDate");

-- AddForeignKey
ALTER TABLE "PayrollHistoricalPayment" ADD CONSTRAINT "PayrollHistoricalPayment_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
