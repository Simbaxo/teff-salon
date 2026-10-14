-- CreateTable
CREATE TABLE "PayrollManualPayment" (
    "id" SERIAL NOT NULL,
    "payrollEntryId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "paymentReference" TEXT,
    "description" TEXT,
    "recordedByUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollManualPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollManualPayment_idempotencyKey_key" ON "PayrollManualPayment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PayrollManualPayment_payrollEntryId_idx" ON "PayrollManualPayment"("payrollEntryId");

-- CreateIndex
CREATE INDEX "PayrollManualPayment_paymentDate_idx" ON "PayrollManualPayment"("paymentDate");

-- CreateIndex
CREATE INDEX "PayrollManualPayment_recordedByUserId_idx" ON "PayrollManualPayment"("recordedByUserId");

-- AddForeignKey
ALTER TABLE "PayrollManualPayment" ADD CONSTRAINT "PayrollManualPayment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollManualPayment" ADD CONSTRAINT "PayrollManualPayment_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
