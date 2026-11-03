-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('OWNER_WITHDRAWAL', 'BANK_DEPOSIT', 'CASH_EXPENSE', 'TECHNICIAN_LOAN', 'CASH_ADJUSTMENT_IN', 'CASH_ADJUSTMENT_OUT', 'REVERSAL');

-- CreateTable
CREATE TABLE "Cashbox" (
    "id" INTEGER NOT NULL,
    "openingBalance" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cashbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" SERIAL NOT NULL,
    "cashboxId" INTEGER NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "recordedById" INTEGER NOT NULL,
    "employeeId" INTEGER,
    "payrollAdjustmentId" INTEGER,
    "idempotencyKey" TEXT NOT NULL,
    "reversalOfId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCount" (
    "id" SERIAL NOT NULL,
    "cashboxId" INTEGER NOT NULL,
    "countedById" INTEGER NOT NULL,
    "countedAmount" INTEGER NOT NULL,
    "expectedAmount" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_payrollAdjustmentId_key" ON "CashMovement"("payrollAdjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_idempotencyKey_key" ON "CashMovement"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_reversalOfId_key" ON "CashMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "CashMovement_cashboxId_createdAt_idx" ON "CashMovement"("cashboxId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_employeeId_idx" ON "CashMovement"("employeeId");

-- CreateIndex
CREATE INDEX "CashCount_cashboxId_createdAt_idx" ON "CashCount"("cashboxId", "createdAt");

-- AddForeignKey
ALTER TABLE "Cashbox" ADD CONSTRAINT "Cashbox_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_payrollAdjustmentId_fkey" FOREIGN KEY ("payrollAdjustmentId") REFERENCES "PayrollAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "CashMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_cashboxId_fkey" FOREIGN KEY ("cashboxId") REFERENCES "Cashbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
