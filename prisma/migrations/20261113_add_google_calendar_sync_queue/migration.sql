CREATE TYPE "GoogleCalendarSyncTarget" AS ENUM (
    'APPOINTMENT',
    'SCHEDULE_BLOCK'
);

CREATE TABLE "GoogleCalendarSyncJob" (
    "id" SERIAL NOT NULL,
    "target" "GoogleCalendarSyncTarget" NOT NULL,
    "targetId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarSyncJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleCalendarSyncJob_target_targetId_key"
    ON "GoogleCalendarSyncJob"("target", "targetId");

CREATE INDEX "GoogleCalendarSyncJob_nextRunAt_idx"
    ON "GoogleCalendarSyncJob"("nextRunAt");