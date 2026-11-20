import { prisma } from "@/lib/prisma";
import type { WhatsAppNotification } from "@/generated/prisma/client";

type ValidationResult = { valid: true } | { valid: false; reason: string };

export async function validateWhatsAppNotification(
  notification: WhatsAppNotification,
): Promise<ValidationResult> {
  const appointment = await prisma.appointment.findUnique({
    where: {
      id: notification.appointmentId,
    },
    select: {
      id: true,
      bookingId: true,
      status: true,
      date: true,
      startTime: true,
      customer: {
        select: {
          phone: true,
        },
      },
    },
  });

  if (!appointment) {
    return {
      valid: false,
      reason: "APPOINTMENT_NOT_FOUND",
    };
  }

  if (appointment.bookingId !== notification.bookingId) {
    return {
      valid: false,
      reason: "BOOKING_CHANGED",
    };
  }

  if (
    appointment.date.getTime() !== notification.appointmentDate.getTime() ||
    appointment.startTime !== notification.appointmentTime
  ) {
    return {
      valid: false,
      reason: "APPOINTMENT_RESCHEDULED",
    };
  }

  if (
    !appointment.customer.phone ||
    appointment.customer.phone !== notification.recipientPhone
  ) {
    return {
      valid: false,
      reason: "RECIPIENT_CHANGED",
    };
  }

  const now = new Date();

  if (notification.type === "APPOINTMENT_CANCELLATION") {
    return appointment.status === "CANCELLED"
      ? { valid: true }
      : {
          valid: false,
          reason: "APPOINTMENT_NOT_CANCELLED",
        };
  }

  if (notification.type === "BOOKING_CONFIRMATION") {
    return appointment.status === "BOOKED"
      ? { valid: true }
      : {
          valid: false,
          reason: "APPOINTMENT_NOT_BOOKED",
        };
  }

  if (notification.type === "APPOINTMENT_REMINDER") {
    if (appointment.status !== "BOOKED") {
      return {
        valid: false,
        reason: "APPOINTMENT_NOT_BOOKED",
      };
    }

    const date = appointment.date.toISOString().slice(0, 10);

    const appointmentDateTime = new Date(
      `${date}T${appointment.startTime}:00-05:00`,
    );

    if (appointmentDateTime.getTime() <= now.getTime()) {
      return {
        valid: false,
        reason: "APPOINTMENT_ALREADY_STARTED",
      };
    }

    return { valid: true };
  }

  return {
    valid: false,
    reason: "UNKNOWN_NOTIFICATION_TYPE",
  };
}
