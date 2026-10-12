
import { prisma } from "../src/lib/prisma";
import { lockPayrollWeek } from "../src/lib/payroll/period-lock";

// Development-only test. No database records are modified.
const week = new Date("2026-09-14T00:00:00.000Z");

const delay = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("🔒 TEFF — Payroll Lock Concurrency Test");

    const events: string[] = [];

    // First transaction holds the lock for two seconds.
    const first = prisma.$transaction(
        async (tx) => {
            await lockPayrollWeek(tx, week);
            events.push("first-acquired");
            console.log("Transaction 1: lock acquired");

            await delay(2000);

            events.push("first-finished");
            console.log("Transaction 1: finishing");
        },
        { timeout: 10000 }
    );

    // Allow transaction 1 to acquire the lock first.
    await delay(300);

    // Second transaction must wait for the same lock.
    const second = prisma.$transaction(
        async (tx) => {
            console.log("Transaction 2: waiting for lock");

            await lockPayrollWeek(tx, week);

            events.push("second-acquired");
            console.log("Transaction 2: lock acquired");
        },
        { timeout: 10000 }
    );

    await Promise.all([first, second]);

    const expected = [
        "first-acquired",
        "first-finished",
        "second-acquired",
    ];

    if (JSON.stringify(events) !== JSON.stringify(expected)) {
        throw new Error(
            `Unexpected lock order: ${events.join(", ")}`
        );
    }

    console.log("✅ Concurrent transactions serialized correctly");
}

main()
    .catch((error) => {
        console.error("❌ Concurrency test failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
