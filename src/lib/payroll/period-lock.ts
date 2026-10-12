
import type { Prisma } from "@/generated/prisma/client";

// PostgreSQL transaction-scoped advisory lock.
// Serializes financial operations for the same payroll week.
export async function lockPayrollWeek(
    tx: Prisma.TransactionClient,
    weekStart: Date
) {
    const week = weekStart.toISOString().slice(0, 10);

    // pg_advisory_xact_lock returns void.
    // Cast it to text so Prisma can deserialize the result.
    await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
            hashtext('teff-payroll'),
            hashtext(${week})
        )::text
    `;
}
