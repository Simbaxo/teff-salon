
-- Add receipt upload idempotency without changing existing receipts.

ALTER TABLE "ExpenseReceipt"
ADD COLUMN "idempotencyKey" TEXT;

-- Each non-null upload key may belong to only one receipt.

CREATE UNIQUE INDEX "ExpenseReceipt_idempotencyKey_key"
ON "ExpenseReceipt"("idempotencyKey");
