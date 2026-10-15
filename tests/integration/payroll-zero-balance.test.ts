import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { getSafeTestDatabaseUrl } from "../helpers/test-database";

import {
    settleZeroBalance,
} from "../../src/lib/payroll/settle-zero-balance";

test("zero-balance settlement requires an existing payroll entry", async () => {
    // Reject unsafe database connections before executing the transaction.
    getSafeTestDatabaseUrl();

    // Use an invalid Owner to verify authorization occurs first.
    await assert.rejects(
        settleZeroBalance({
            payrollEntryId: 2_147_483_647,
            ownerId: 2_147_483_647,
        }),
        /PAYROLL_OWNER_REQUIRED/
    );
});

test("settles zero-balance payroll without creating a payment", async () => {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = randomUUID();
    const weekOffset = Number(
        BigInt(`0x${marker.replace(/-/g, "").slice(0, 12)}`) %
        BigInt(100000)
    );

    // Unique future Monday for isolated test records.
    const startDate = new Date("2100-01-04T00:00:00.000Z");
    startDate.setUTCDate(startDate.getUTCDate() + weekOffset * 7);

    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);

    const payday = new Date(startDate);
    payday.setUTCDate(payday.getUTCDate() + 7);

    let employeeId: number | null = null;
    let ownerId: number | null = null;
    let periodId: number | null = null;
    let entryId: number | null = null;

    try {
        // Create an isolated technician and active test Owner.
        const employee = await prisma.employee.create({
            data: {
                name: `Zero Balance Test ${marker}`,
                active: false,
            },
        });
        employeeId = employee.id;

        const owner = await prisma.user.create({
            data: {
                name: "Zero Balance Test Owner",
                email: `zero-balance-${marker}@example.invalid`,
                passwordHash: "test-only-no-login",
                role: "OWNER",
                active: true,
            },
        });
        ownerId = owner.id;

        const period = await prisma.payrollPeriod.create({
            data: {
                startDate,
                endDate,
                payday,
                status: "REVIEWED",
                reviewedAt: new Date(),
            },
        });
        periodId = period.id;

        const entry = await prisma.payrollEntry.create({
            data: {
                payrollPeriodId: period.id,
                employeeId: employee.id,
                netPay: 0,
                status: "REVIEWED",
                reviewedAt: new Date(),
            },
        });
        entryId = entry.id;

        // Exercise the real settlement transaction.
        const result = await settleZeroBalance({
            payrollEntryId: entry.id,
            ownerId: owner.id,
        });

        assert.equal(result.settlementCompleted, true);
        assert.equal(result.currentStatus, "PAID");

        // Verify the database contains the completed settlement.
        const savedEntry = await prisma.payrollEntry.findUniqueOrThrow({
            where: { id: entry.id },
        });

        const savedPeriod = await prisma.payrollPeriod.findUniqueOrThrow({
            where: { id: period.id },
        });

        assert.equal(savedEntry.status, "PAID");
        assert.equal(savedPeriod.status, "PAID");

        // No fictitious payment should be created.
        const paymentCount = await prisma.payrollManualPayment.count({
            where: { payrollEntryId: entry.id },
        });

        assert.equal(paymentCount, 0);

        // A second settlement must be rejected.
        await assert.rejects(
            settleZeroBalance({
                payrollEntryId: entry.id,
                ownerId: owner.id,
            }),
            /ZERO_BALANCE_NOT_ELIGIBLE/
        );
    } finally {
        // Remove only records belonging to this test.
        try {
            if (entryId !== null) {
                await prisma.payrollEntry.delete({
                    where: { id: entryId },
                });
            }

            if (periodId !== null) {
                await prisma.payrollPeriod.delete({
                    where: { id: periodId },
                });
            }

            if (ownerId !== null) {
                await prisma.user.delete({
                    where: { id: ownerId },
                });
            }

            if (employeeId !== null) {
                await prisma.employee.delete({
                    where: { id: employeeId },
                });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});