
-- Store SHA-256 checksums for receipt upload verification.
-- Existing receipts retain NULL checksums.

ALTER TABLE "ExpenseReceipt"
ADD COLUMN "contentSha256" TEXT;
