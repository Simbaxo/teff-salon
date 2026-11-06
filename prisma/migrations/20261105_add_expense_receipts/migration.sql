
-- CreateTable
CREATE TABLE "ExpenseReceipt" (
    "id" SERIAL NOT NULL,
    "expenseId" INTEGER NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseReceipt_blobPathname_key"
ON "ExpenseReceipt"("blobPathname");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_expenseId_createdAt_idx"
ON "ExpenseReceipt"("expenseId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseReceipt_uploadedById_idx"
ON "ExpenseReceipt"("uploadedById");

-- AddForeignKey
ALTER TABLE "ExpenseReceipt"
ADD CONSTRAINT "ExpenseReceipt_expenseId_fkey"
FOREIGN KEY ("expenseId")
REFERENCES "Expense"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReceipt"
ADD CONSTRAINT "ExpenseReceipt_uploadedById_fkey"
FOREIGN KEY ("uploadedById")
REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
