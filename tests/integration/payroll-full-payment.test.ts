import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { recordManualPayment } from "../../src/lib/payroll/record-manual-payment";

test("records full payroll payment and prevents duplicates", async () => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString, "DATABASE_URL is missing");

    // Only permit the isolated Neon development database.
    const endpoint = new URL(connectionString).hostname
        .replace(/-pooler(?=\.)/, "");

    assert.equal(
        endpoint,
        // Only allow this financial test on Neon development.
        "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech"
    );

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = randomUUID();

    // Use a unique future Monday for each integration test run.
    const runNumber = BigInt(`0x${marker.replace(/-/g, "").slice(0, 12)}`);
    const weekOffset = Number(runNumber % BigInt(100000));

    const startDate = new Date("2100-01-04T00:00:00.000Z");
    startDate.setUTCDate(startDate.getUTCDate() + weekOffset * 7);

    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 6);

    const payday = new Date(startDate);
    payday.setUTCDate(payday.getUTCDate() + 7);

    const paymentDate = payday.toISOString().slice(0, 10);

    let employeeId: number | null = null;
    let ownerId: number | null = null;
    let periodId: number | null = null;
    let entryId: number | null = null;

    try {
        // Create isolated fake records for this test.
        const employee = await prisma.employee.create({
            data: {
                name: `Payroll Test ${marker}`,
                active: false,
            },
        });
        employeeId = employee.id;

        const owner = await prisma.user.create({
            data: {
                name: "Payroll Test Owner",
                email: `payroll-${marker}@example.invalid`,
                passwordHash: "test-only-no-login",
                role: "OWNER",
                active: true,
            },
        });
        ownerId = owner.id;

        // Use a unique future week to avoid collisions.
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
                netPay: 400000,
                status: "REVIEWED",
                reviewedAt: new Date(),
            },
        });
        entryId = entry.id;

        const paymentInput = {
            payrollEntryId: entry.id,
            amount: 400000,
            paymentDate,
            paymentMethod: "OTHER" as const,
            idempotencyKey: randomUUID(),
            paymentReference: null,
            description: "Pago completo de prueba",
            confirmedDelivered: true as const,
            confirmedNotPreviouslyRecorded: true as const,
        };

        // Exercise the real payment-writing transaction.
        const result = await recordManualPayment({
            input: paymentInput,
            ownerId: owner.id,
            database: prisma,
        });

        assert.equal(result.paymentRecorded, true);

        const savedEntry = await prisma.payrollEntry.findUniqueOrThrow({
            where: { id: entry.id },
        });

        assert.equal(savedEntry.status, "PAID");

        const savedPeriod = await prisma.payrollPeriod.findUniqueOrThrow({
            where: { id: period.id },
        });

        assert.equal(savedPeriod.status, "PAID");

        const payments = await prisma.payrollManualPayment.findMany({
            where: { payrollEntryId: entry.id },
        });

        assert.equal(payments.length, 1);
        assert.equal(payments[0].amount, 400000);

        // Retrying the identical request must not create another payment.
        const retry = await recordManualPayment({
            input: paymentInput,
            ownerId: owner.id,
            database: prisma,
        });

        assert.equal(retry.alreadyRecorded, true);

        const paymentCount = await prisma.payrollManualPayment.count({
            where: { payrollEntryId: entry.id },
        });

        assert.equal(paymentCount, 1);
    } finally {
        // Clean up only records created by this test.
        try {
            if (entryId !== null) {
                await prisma.payrollManualPayment.deleteMany({
                    where: { payrollEntryId: entryId },
                });
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