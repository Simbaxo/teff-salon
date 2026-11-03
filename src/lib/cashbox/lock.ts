import type { Prisma } from "@/generated/prisma/client";

// Serialize manual cashbox operations.
// Every cashbox writer must acquire this lock
// before checking or modifying the balance.
export async function lockCashbox(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
            hashtext('teff-cashbox'),
            1
        )::text
    `;
}
