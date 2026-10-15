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
        "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech"
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

    // Never allow this test to connect to production.
    const hostname = new URL(connectionString).hostname
        .replace(/-pooler(?=\.)/, "");

    assert.equal(
        hostname,
        "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech"
    );

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    let ownerId: number | null = null;

    try {
        // Create a dedicated active Owner for this test.
        const owner = await prisma.user.create({
            data: {
                name: "Payroll Integration Test Owner",
                email: `payroll-test-${crypto.randomUUID()}@example.invalid`,
                passwordHash: "test-only-no-login",
                role: "OWNER",
                active: true,
            },
        });

        ownerId = owner.id;

        // Verify the real transaction rejects a missing entry.
        await assert.rejects(
            recordManualPayment({
                ownerId: owner.id,
                database: prisma,
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
        // Remove only the Owner created by this test.
        try {
            if (ownerId !== null) {
                await prisma.user.delete({
                    where: { id: ownerId },
                });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});

test("rejects payroll payment access for a receptionist", async () => {
    const connectionString = process.env.DATABASE_URL;

    assert.ok(connectionString, "DATABASE_URL is missing");

    // Ensure this test runs only against the approved development branch.
    const endpoint = new URL(connectionString).hostname
        .replace(/-pooler(?=\.)/, "");

    assert.equal(
        endpoint,
        "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech"
    );

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    let receptionistId: number | null = null;

    try {
        const receptionist = await prisma.user.create({
            data: {
                name: "Payroll Test Receptionist",
                email: `payroll-reception-${crypto.randomUUID()}@example.invalid`,
                passwordHash: "test-only-no-login",
                role: "RECEPTIONIST",
                active: true,
            },
        });

        receptionistId = receptionist.id;

        // A receptionist must be rejected before financial operations.
        await assert.rejects(
            recordManualPayment({
                ownerId: receptionist.id,
                database: prisma,
                input: {
                    payrollEntryId: 2_147_483_647,
                    amount: 400000,
                    paymentDate: "2026-10-15",
                    paymentMethod: "OTHER",
                    idempotencyKey: crypto.randomUUID(),
                    paymentReference: null,
                    description: "Prueba de autorización",
                    confirmedDelivered: true,
                    confirmedNotPreviouslyRecorded: true,
                },
            }),
            /PAYROLL_OWNER_REQUIRED/
        );
    } finally {
        try {
            if (receptionistId !== null) {
                await prisma.user.delete({
                    where: { id: receptionistId },
                });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});