-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WhatsAppNotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'APPOINTMENT_REMINDER', 'APPOINTMENT_CANCELLATION');

-- CreateEnum
CREATE TYPE "WhatsAppNotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "WhatsAppNotification" (
    "id" SERIAL NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "bookingId" INTEGER,
    "type" "WhatsAppNotificationType" NOT NULL,
    "status" "WhatsAppNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "appointmentDate" TIMESTAMP(3) NOT NULL,
    "appointmentTime" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockToken" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNotification_idempotencyKey_key" ON "WhatsAppNotification"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppNotification_providerMessageId_key" ON "WhatsAppNotification"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_status_scheduledFor_idx" ON "WhatsAppNotification"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_status_nextAttemptAt_idx" ON "WhatsAppNotification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_appointmentId_type_idx" ON "WhatsAppNotification"("appointmentId", "type");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_bookingId_idx" ON "WhatsAppNotification"("bookingId");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_lockedAt_idx" ON "WhatsAppNotification"("lockedAt");

