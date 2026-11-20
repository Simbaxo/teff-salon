import { prisma } from "@/lib/prisma";
import { validateWhatsAppNotification } from "@/lib/whatsapp/validate";

type WhatsAppWorkerPreview = {
  status: "disabled" | "empty" | "ready" | "invalid";
  processed: number;
  sent: number;
  reason?: string;
};

export async function previewWhatsAppWorker(): Promise<WhatsAppWorkerPreview> {
  // Never access the queue unless explicitly enabled.
  if (process.env.TEFF_WHATSAPP_QUEUE_ENABLED !== "true") {
    return {
      status: "disabled",
      processed: 0,
      sent: 0,
    };
  }

  const now = new Date();

  // Read-only preview: no claiming or status changes.
  const notification = await prisma.whatsAppNotification.findFirst({
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
  });

  if (!notification) {
    return {
      status: "empty",
      processed: 0,
      sent: 0,
    };
  }

  const validation = await validateWhatsAppNotification(notification);

  if (!validation.valid) {
    return {
      status: "invalid",
      processed: 0,
      sent: 0,
      reason: validation.reason,
    };
  }

  return {
    status: "ready",
    processed: 0,
    sent: 0,
  };
}
