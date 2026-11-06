-- Set the first eligible month for recurring expenses.
-- Existing Development table was verified empty.

ALTER TABLE "RecurringExpense"
ADD COLUMN "startMonth" TIMESTAMP(3) NOT NULL;

CREATE INDEX "RecurringExpense_startMonth_idx"
ON "RecurringExpense"("startMonth");