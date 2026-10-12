
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { lockPayrollWeek } from "../src/lib/payroll/period-lock";

async function main() {
    // Development-only test: no payroll records are changed.
    const weekStart = new Date("2026-09-14T00:00:00.000Z");

    console.log("🔒 Testing TEFF payroll-week lock");

    await prisma.$transaction(
        async (tx) => {
            await lockPayrollWeek(tx, weekStart);

            console.log("✅ Payroll-week lock acquired");

            // Read-only query to verify the transaction remains usable.
            const count = await tx.payrollPeriod.count();

            console.log(`Payroll periods found: ${count}`);
        },
        {
            isolationLevel:
                Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
        }
    );

    console.log("✅ Transaction completed and lock released");
}

main()
    .catch((error) => {
        console.error("❌ Payroll lock test failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
