import { Prisma, WhatsAppNotificationType } from "@/generated/prisma/client";

type QueueTransaction = Prisma.TransactionClient;

type QueueWhatsAppNotificationInput = {
  appointmentId: number;
  bookingId?: number | null;
  type: WhatsAppNotificationType;
  recipientPhone: string;
  appointmentDate: Date;
  appointmentTime: string;
  scheduledFor: Date;
  idempotencyKey: string;
};

export async function queueWhatsAppNotification(
  tx: QueueTransaction,
  input: QueueWhatsAppNotificationInput,
) {
  if (!Number.isSafeInteger(input.appointmentId) || input.appointmentId <= 0) {
    throw new Error("INVALID_APPOINTMENT_ID");
  }

  if (
    input.bookingId != null &&
    (!Number.isSafeInteger(input.bookingId) || input.bookingId <= 0)
  ) {
    throw new Error("INVALID_BOOKING_ID");
  }

  if (!/^\+[1-9]\d{7,14}$/.test(input.recipientPhone)) {
    throw new Error("INVALID_WHATSAPP_PHONE");
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.appointmentTime)) {
    throw new Error("INVALID_APPOINTMENT_TIME");
  }

  if (
    Number.isNaN(input.appointmentDate.getTime()) ||
    Number.isNaN(input.scheduledFor.getTime())
  ) {
    throw new Error("INVALID_NOTIFICATION_DATE");
  }

  if (!input.idempotencyKey.trim()) {
    throw new Error("INVALID_IDEMPOTENCY_KEY");
  }

  const existing = await tx.whatsAppNotification.findUnique({
    where: {
      idempotencyKey: input.idempotencyKey,
    },
  });

  if (existing) {
    return existing;
  }

  try {
    return await tx.whatsAppNotification.create({
      data: {
        appointmentId: input.appointmentId,
        bookingId: input.bookingId ?? null,
        type: input.type,
        recipientPhone: input.recipientPhone,
        appointmentDate: input.appointmentDate,
        appointmentTime: input.appointmentTime,
        scheduledFor: input.scheduledFor,
        idempotencyKey: input.idempotencyKey,
        status: "PENDING",
      },
    });
  } catch (error) {
    // A unique conflict inside a PostgreSQL transaction aborts that
    // transaction. Let the caller retry the entire transaction safely.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("WHATSAPP_QUEUE_CONFLICT");
    }

    throw error;
  }
}
