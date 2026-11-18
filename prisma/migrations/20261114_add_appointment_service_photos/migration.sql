CREATE TABLE "AppointmentServicePhoto" (
    "id" SERIAL NOT NULL,
    "appointmentId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "blobPath" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentServicePhoto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AppointmentServicePhoto_slot_check"
        CHECK ("slot" BETWEEN 1 AND 4),
    CONSTRAINT "AppointmentServicePhoto_appointmentId_serviceId_fkey"
        FOREIGN KEY ("appointmentId", "serviceId")
        REFERENCES "AppointmentService" ("appointmentId", "serviceId")
        ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AppointmentServicePhoto_blobPath_key"
    ON "AppointmentServicePhoto" ("blobPath");

CREATE UNIQUE INDEX "AppointmentServicePhoto_appointmentId_serviceId_slot_key"
    ON "AppointmentServicePhoto" ("appointmentId", "serviceId", "slot");