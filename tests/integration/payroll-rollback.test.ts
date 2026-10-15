import assert from "node:assert/strict";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

test("rolls back a payroll payment when the transaction fails", async () => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString, "DATABASE_URL is missing");

    // Never connect this test to an unapproved database.
    const endpoint = new URL(connectionString).hostname
        .replace(/-pooler(?=\.)/, "");

    assert.equal(
        endpoint,
        "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech"
    );

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-payroll-rollback-${crypto.randomUUID()}`;
    let paymentId: number | undefined;

    try {
        await assert.rejects(
            prisma.$transaction(async (tx) => {
                // All test records belong to this transaction.
                const employee = await tx.employee.create({
                    data: { name: marker, active: false },
                });

                const owner = await tx.user.create({
                    data: {
                        name: marker,
                        email: `${marker}@example.invalid`,
                        passwordHash: "test-only-no-login",
                        role: "OWNER",
                        active: false,
                    },
                });

                const period = await tx.payrollPeriod.create({
                    data: {
                        startDate: new Date("2099-01-05T00:00:00.000Z"),
                        endDate: new Date("2099-01-11T00:00:00.000Z"),
                        payday: new Date("2099-01-12T00:00:00.000Z"),
                        status: "REVIEWED",
                    },
                });

                const entry = await tx.payrollEntry.create({
                    data: {
                        payrollPeriodId: period.id,
                        employeeId: employee.id,
                        netPay: 100000,
                        status: "REVIEWED",
                    },
                });

                const payment = await tx.payrollManualPayment.create({
                    data: {
                        payrollEntryId: entry.id,
                        amount: 50000,
                        paymentDate: new Date("2099-01-12T00:00:00.000Z"),
                        paymentMethod: "TRANSFER",
                        idempotencyKey: marker,
                        recordedByUserId: owner.id,
                    },
                });

                paymentId = payment.id;

                // Simulate a failure after payment insertion.
                throw new Error("TEST_ROLLBACK");
            }),
            /TEST_ROLLBACK/
        );

        assert.ok(paymentId !== undefined);

        // Verify that the failed transaction left no payment.
        const payment = await prisma.payrollManualPayment.findUnique({
            where: { idempotencyKey: marker },
        });

        assert.equal(payment, null);

        // Verify that the related test records also rolled back.
        const employee = await prisma.employee.findFirst({
            where: { name: marker },
        });

        assert.equal(employee, null);
    } finally {
        await prisma.$disconnect();
    }
});