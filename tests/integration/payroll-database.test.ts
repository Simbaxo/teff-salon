import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { recordManualPayment } from "../../src/lib/payroll/record-manual-payment";

test("connects to the isolated payroll test database", async () => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString, "DATABASE_URL is missing");

    // Reject unexpected endpoints before opening a connection.
    const hostname = new URL(connectionString).hostname
        .replace(/-pooler(?=\.)/, "");

    assert.equal(
        hostname,
        "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech"
    );

    const adapter = new PrismaPg({ connectionString });
    const prisma = new PrismaClient({ adapter });

    try {
        // Read-only checks for the migrated payroll tables.
        const [periods, entries, payments] = await Promise.all([
            prisma.payrollPeriod.count(),
            prisma.payrollEntry.count(),
            prisma.payrollManualPayment.count(),
        ]);

        assert.ok(periods >= 0);
        assert.ok(entries >= 0);
        assert.ok(payments >= 0);

        console.log("Development payroll tables verified.");
    } finally {
        await prisma.$disconnect();
    }
});

test("rejects payment for a nonexistent payroll entry", async () => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString, "DATABASE_URL is missing");

    // Verify isolation before calling the real payment transaction.
    const hostname = new URL(connectionString).hostname
        .replace(/-pooler(?=\.)/, "");

    assert.equal(
        hostname,
        "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech"
    );

    const adapter = new PrismaPg({ connectionString });
    const prisma = new PrismaClient({ adapter });

    try {
        // An invalid entry must be rejected before any payment is created.
        await assert.rejects(
            recordManualPayment({
                ownerId: 1,
                input: {
                    payrollEntryId: 2_147_483_647,
                    amount: 150000,
                    paymentDate: "2026-10-15",
                    paymentMethod: "TRANSFER",
                    idempotencyKey: crypto.randomUUID(),
                    paymentReference: null,
                    description: "Prueba de integración",
                    confirmedDelivered: true,
                    confirmedNotPreviouslyRecorded: true,
                },
            }),
            /ENTRY_NOT_FOUND/
        );
    } finally {
        await prisma.$disconnect();
    }
});