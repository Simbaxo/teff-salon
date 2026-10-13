
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";

async function main() {
    console.log("🔒 TEFF — Payroll Review Rollback Test");

    // Use the existing development payroll period.
    const week = new Date("2026-09-14T00:00:00.000Z");

    const period = await prisma.payrollPeriod.findUnique({
        where: { startDate: week },
        include: {
            entries: {
                select: {
                    id: true,
                    status: true,
                    reviewedAt: true,
                },
            },
        },
    });

    if (!period || period.status !== "DRAFT") {
        throw new Error("Expected a DRAFT payroll period");
    }

    if (
        period.entries.length === 0 ||
        period.entries.some(
            (entry) => entry.status !== "DRAFT"
        )
    ) {
        throw new Error("Expected only DRAFT payroll entries");
    }

    const entry = period.entries[0];

    try {
        await prisma.$transaction(
            async (tx) => {
                // Simulate approving one technician.
                await tx.payrollEntry.update({
                    where: { id: entry.id },
                    data: {
                        status: "REVIEWED",
                        reviewedAt: new Date(),
                    },
                });

                // Deliberately fail before approving the period.
                throw new Error("TEST_ROLLBACK");
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
            }
        );
    } catch (error) {
        if (
            !(error instanceof Error) ||
            error.message !== "TEST_ROLLBACK"
        ) {
            throw error;
        }

        console.log("Expected failure triggered.");
    }

    // Verify the attempted update was rolled back.
    const after = await prisma.payrollEntry.findUniqueOrThrow({
        where: { id: entry.id },
        select: {
            status: true,
            reviewedAt: true,
        },
    });

    if (
        after.status !== entry.status ||
        after.reviewedAt?.getTime() !==
            entry.reviewedAt?.getTime()
    ) {
        throw new Error("ROLLBACK_VERIFICATION_FAILED");
    }

    console.log("✅ Payroll entry remained unchanged.");
    console.log("✅ Transaction rollback verified.");
}

main()
    .catch((error) => {
        console.error("❌ Rollback test failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });