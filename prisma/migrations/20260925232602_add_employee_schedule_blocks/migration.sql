-- CreateTable
CREATE TABLE "EmployeeScheduleBlock" (
    "id" SERIAL NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeScheduleBlock_employeeId_date_idx" ON "EmployeeScheduleBlock"("employeeId", "date");

-- AddForeignKey
ALTER TABLE "EmployeeScheduleBlock" ADD CONSTRAINT "EmployeeScheduleBlock_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
