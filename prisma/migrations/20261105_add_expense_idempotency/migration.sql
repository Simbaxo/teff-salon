
-- Add a nullable idempotency key for unified purchase submissions.
-- Existing and recurring expenses retain NULL values.

ALTER TABLE "Expense"
ADD COLUMN "idempotencyKey" TEXT;

-- Prevent duplicate expense creation for the same submission key.

CREATE UNIQUE INDEX "Expense_idempotencyKey_key"
ON "Expense"("idempotencyKey");
