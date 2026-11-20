-- AlterTable
ALTER TABLE "EmployeeScheduleBlock" ADD COLUMN "groupId" TEXT;

-- CreateIndex
CREATE INDEX "EmployeeScheduleBlock_groupId_idx"
ON "EmployeeScheduleBlock"("groupId");