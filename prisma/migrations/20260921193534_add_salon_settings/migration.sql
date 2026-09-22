-- CreateTable
CREATE TABLE "SalonSettings" (
    "id" SERIAL NOT NULL,
    "weeklySalesGoal" INTEGER NOT NULL DEFAULT 0,
    "monthlySalesGoal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalonSettings_pkey" PRIMARY KEY ("id")
);
