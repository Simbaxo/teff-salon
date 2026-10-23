-- CreateEnum
CREATE TYPE "EmployeeCompensationType" AS ENUM ('COMMISSION', 'FIXED_WEEKLY');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "compensationType" "EmployeeCompensationType" NOT NULL DEFAULT 'COMMISSION',
ADD COLUMN     "isBookable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "salaryStartDate" TIMESTAMP(3),
ADD COLUMN     "weeklySalary" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PayrollEntry" ADD COLUMN     "salaryTotal" INTEGER NOT NULL DEFAULT 0;
