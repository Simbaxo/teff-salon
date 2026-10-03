/*
  Warnings:

  - The primary key for the `AppointmentAddon` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "AppointmentAddon" DROP CONSTRAINT "AppointmentAddon_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "AppointmentAddon_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "AppointmentAddon_appointmentId_idx" ON "AppointmentAddon"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentAddon_addonId_idx" ON "AppointmentAddon"("addonId");
