
import type { Prisma } from "@/generated/prisma/client";

// PostgreSQL transaction-scoped advisory lock.
// Every financial-writing route must use this helper
// before reading or changing payroll-related records.
export async function lockPayrollWeek(
    tx: Prisma.TransactionClient,
    weekStart: Date
) {
    const week = weekStart.toISOString().slice(0, 10);

    // Serialize payroll-related operations for the same week.
    await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
            hashtext('teff-payroll'),
            hashtext(${week})
        )
    `;
}
