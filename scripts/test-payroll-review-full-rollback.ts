
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";
import { lockPayrollWeek } from "../src/lib/payroll/period-lock";

async function main() {
    console.log("🔒 TEFF — Full Payroll Rollback Test");

    const week = new Date("2026-09-14T00:00:00.000Z");

    // Development test records belonging to Yenifer.
    const payrollEntryId = 6;
    const commissionId = 10;
    const tipId = 6;

    // Capture the original database state.
    const before = await prisma.$transaction(async (tx) => {
        const period = await tx.payrollPeriod.findUniqueOrThrow({
            where: { startDate: week },
        });

        const entry = await tx.payrollEntry.findUniqueOrThrow({
            where: { id: payrollEntryId },
        });

        const commission = await tx.commission.findUniqueOrThrow({
            where: { id: commissionId },
        });

        const tip = await tx.tip.findUniqueOrThrow({
            where: { id: tipId },
        });

        assert.equal(period.status, "DRAFT");
        assert.equal(entry.status, "DRAFT");
        assert.equal(commission.employeeId, entry.employeeId);
        assert.equal(tip.employeeId, entry.employeeId);
        assert.equal(entry.payrollPeriodId, period.id);
        assert.equal(commission.payrollEntryId, null);
        assert.equal(tip.payrollEntryId, null);

        return { period, entry, commission, tip };
    });

    let expectedFailure = false;

    try {
        await prisma.$transaction(
            async (tx) => {
                // Use the same week lock as payroll operations.
                await lockPayrollWeek(tx, week);

                // Simulate assigning the commission.
                const commissionUpdate =
                    await tx.commission.updateMany({
                        where: {
                            id: commissionId,
                            employeeId: before.entry.employeeId,
                            payrollEntryId: null,
                        },
                        data: {
                            payrollEntryId,
                        },
                    });

                assert.equal(commissionUpdate.count, 1);

                // Simulate assigning the tip.
                const tipUpdate = await tx.tip.updateMany({
                    where: {
                        id: tipId,
                        employeeId: before.entry.employeeId,
                        payrollEntryId: null,
                    },
                    data: {
                        payrollEntryId,
                    },
                });

                assert.equal(tipUpdate.count, 1);

                // Simulate approving the technician.
                const entryUpdate =
                    await tx.payrollEntry.updateMany({
                        where: {
                            id: payrollEntryId,
                            status: "DRAFT",
                        },
                        data: {
                            status: "REVIEWED",
                            reviewedAt: new Date(),
                        },
                    });

                assert.equal(entryUpdate.count, 1);

                // Deliberately fail after all three updates.
                throw new Error("TEST_FULL_ROLLBACK");
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            }
        );
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "TEST_FULL_ROLLBACK"
        ) {
            expectedFailure = true;
            console.log("Expected failure triggered.");
        } else {
            throw error;
        }
    }

    assert.equal(expectedFailure, true);

    // Verify that all attempted changes were rolled back.
    const after = await prisma.$transaction(async (tx) => ({
        period: await tx.payrollPeriod.findUniqueOrThrow({
            where: { id: before.period.id },
        }),
        entry: await tx.payrollEntry.findUniqueOrThrow({
            where: { id: payrollEntryId },
        }),
        commission: await tx.commission.findUniqueOrThrow({
            where: { id: commissionId },
        }),
        tip: await tx.tip.findUniqueOrThrow({
            where: { id: tipId },
        }),
    }));

    assert.equal(after.period.status, before.period.status);
    assert.equal(after.entry.status, before.entry.status);

    assert.equal(
        after.entry.reviewedAt?.getTime() ?? null,
        before.entry.reviewedAt?.getTime() ?? null
    );

    assert.equal(
        after.commission.payrollEntryId,
        before.commission.payrollEntryId
    );

    assert.equal(
        after.tip.payrollEntryId,
        before.tip.payrollEntryId
    );

    console.log("✅ Commission assignment rolled back.");
    console.log("✅ Tip assignment rolled back.");
    console.log("✅ Technician approval rolled back.");
    console.log("✅ Payroll period remains DRAFT.");
    console.log("✅ Full rollback test passed.");
}

main()
    .catch((error) => {
        console.error("❌ Full rollback test failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });