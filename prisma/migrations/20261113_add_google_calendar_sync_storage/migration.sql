CREATE TABLE "GoogleCalendarConnection" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "calendarId" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleCalendarConnection_calendarId_key"
    ON "GoogleCalendarConnection"("calendarId");