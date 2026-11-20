import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { validateWhatsAppNotification } from "@/lib/whatsapp/validate";

export async function claimNextWhatsAppNotification() {
  const now = new Date();
  const lockToken = randomUUID();

  // Find the earliest eligible pending notification.
  const candidate = await prisma.whatsAppNotification.findFirst({
    where: {
      status: "PENDING",
      scheduledFor: {
        lte: now,
      },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      attempts: {
        lt: 3,
      },
    },
    orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
    select: {
      id: true,
    },
  });

  if (!candidate) {
    return null;
  }

  // Only one worker can transition this record from
  // PENDING to PROCESSING.
  const claimed = await prisma.whatsAppNotification.updateMany({
    where: {
      id: candidate.id,
      status: "PENDING",
      scheduledFor: {
        lte: now,
      },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      attempts: {
        lt: 3,
      },
    },
    data: {
      status: "PROCESSING",
      lockedAt: now,
      lockToken,
      attempts: {
        increment: 1,
      },
    },
  });

  if (claimed.count !== 1) {
    // Another worker claimed this notification first.
    return null;
  }

  return prisma.whatsAppNotification.findFirst({
    where: {
      id: candidate.id,
      status: "PROCESSING",
      lockToken,
    },
  });
}

export async function validateClaimedWhatsAppNotification(
  notification: NonNullable<
    Awaited<ReturnType<typeof claimNextWhatsAppNotification>>
  >,
): Promise<boolean> {
  // Never process a notification without a valid claim token.
  if (notification.status !== "PROCESSING" || !notification.lockToken) {
    return false;
  }

  const validation = await validateWhatsAppNotification(notification);

  if (validation.valid) {
    return true;
  }

  // Only the worker holding this exact claim may
  // cancel the notification.
  await prisma.whatsAppNotification.updateMany({
    where: {
      id: notification.id,
      status: "PROCESSING",
      lockToken: notification.lockToken,
    },
    data: {
      status: "CANCELLED",
      lockedAt: null,
      lockToken: null,
      lastError: validation.reason,
    },
  });

  return false;
}

export async function recordWhatsAppDeliveryFailure(
  notificationId: number,
  lockToken: string,
  reason: string,
  retryable: boolean,
): Promise<boolean> {
  if (
    !Number.isSafeInteger(notificationId) ||
    notificationId <= 0 ||
    !lockToken
  ) {
    throw new Error("INVALID_NOTIFICATION_CLAIM");
  }

  // Only predefined error codes are stored.
  // Never store provider responses, credentials,
  // message contents, or customer phone numbers.
  const allowedReasons = new Set([
    "PROVIDER_RATE_LIMITED",
    "PROVIDER_TEMPORARY_ERROR",
    "PROVIDER_REJECTED",
    "PROVIDER_TIMEOUT_UNCERTAIN",
    "DELIVERY_CONFIGURATION_ERROR",
  ]);

  const safeReason = allowedReasons.has(reason)
    ? reason
    : "DELIVERY_CONFIGURATION_ERROR";

  const notification = await prisma.whatsAppNotification.findFirst({
    where: {
      id: notificationId,
      status: "PROCESSING",
      lockToken,
    },
    select: {
      attempts: true,
      maxAttempts: true,
    },
  });

  if (!notification) {
    return false;
  }

  const canRetry =
    retryable &&
    notification.attempts < notification.maxAttempts &&
    safeReason !== "PROVIDER_TIMEOUT_UNCERTAIN";

  const delayMinutes = notification.attempts === 1 ? 1 : 5;

  const nextAttemptAt = canRetry
    ? new Date(Date.now() + delayMinutes * 60_000)
    : null;

  const updated = await prisma.whatsAppNotification.updateMany({
    where: {
      id: notificationId,
      status: "PROCESSING",
      lockToken,
    },
    data: {
      status: canRetry ? "PENDING" : "FAILED",
      nextAttemptAt,
      lockedAt: null,
      lockToken: null,
      lastError: safeReason,
    },
  });

  return updated.count === 1;
}

export async function recoverStuckWhatsAppNotifications(): Promise<number> {
  const lockTimeoutMinutes = 15;

  const cutoff = new Date(Date.now() - lockTimeoutMinutes * 60_000);

  // A stuck notification may already have been accepted
  // by WAIA. Never return it directly to PENDING.
  const recovered = await prisma.whatsAppNotification.updateMany({
    where: {
      status: "PROCESSING",
      OR: [
        {
          lockedAt: {
            lt: cutoff,
          },
        },
        {
          lockedAt: null,
        },
      ],
    },
    data: {
      status: "FAILED",
      lockedAt: null,
      lockToken: null,
      nextAttemptAt: null,
      lastError: "PROCESSING_TIMEOUT_UNCERTAIN",
    },
  });

  return recovered.count;
}
