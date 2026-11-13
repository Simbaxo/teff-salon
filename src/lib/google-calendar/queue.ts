import type { Prisma } from "@/generated/prisma/client";
import type { GoogleCalendarSyncTarget } from "@/generated/prisma/enums";

export async function queueGoogleCalendarSync(
  tx: Prisma.TransactionClient,
  target: GoogleCalendarSyncTarget,
  targetId: number,
): Promise<void> {
  await tx.googleCalendarSyncJob.upsert({
    where: {
      target_targetId: { target, targetId },
    },
    create: { target, targetId },
    update: {
      revision: { increment: 1 },
      attempts: 0,
      nextRunAt: new Date(),
      lastError: null,
    },
  });
}
