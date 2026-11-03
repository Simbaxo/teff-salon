-- Add a unique request reference to prevent duplicate
-- physical cash counts from repeated submissions.

ALTER TABLE "CashCount"
ADD COLUMN "idempotencyKey" TEXT NOT NULL;

CREATE UNIQUE INDEX "CashCount_idempotencyKey_key"
ON "CashCount"("idempotencyKey");