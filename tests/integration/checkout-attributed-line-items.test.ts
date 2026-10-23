
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";
import { createAttributedLineItems } from "../../src/lib/checkout/create-attributed-line-items";

test("preserves service and add-on attribution with transaction rollback", async () => {
    // Only connect to the approved Neon Development database.
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-line-items-${randomUUID()}`;

    try {
        await assert.rejects(
            prisma.$transaction(
                async (tx) => {
                    // Create isolated records within the transaction.
                    const customer = await tx.customer.create({
                        data: { name: marker },
                    });

                    const employeeA = await tx.employee.create({
                        data: {
                            name: `${marker}-A`,
                            active: true,
                        },
                    });

                    const employeeB = await tx.employee.create({
                        data: {
                            name: `${marker}-B`,
                            active: true,
                        },
                    });

                    const serviceA = await tx.service.create({
                        data: {
                            nameEs: `${marker}-Manicure`,
                            nameEn: "Manicure",
                            category: "TEST",
                            price: 60000,
                            estimatedDuration: 60,
                        },
                    });

                    const serviceB = await tx.service.create({
                        data: {
                            nameEs: `${marker}-Pedicure`,
                            nameEn: "Pedicure",
                            category: "TEST",
                            price: 60000,
                            estimatedDuration: 60,
                        },
                    });

                    const addon = await tx.addon.create({
                        data: {
                            nameEs: `${marker}-Retiro`,
                            nameEn: "Removal",
                            price: 15000,
                            estimatedDuration: 15,
                        },
                    });

                    const appointment = await tx.appointment.create({
                        data: {
                            customerId: customer.id,
                            employeeId: employeeA.id,
                            date: new Date("2099-01-05T00:00:00.000Z"),
                            startTime: "10:00",
                            duration: 120,
                            status: "IN_PROGRESS",
                        },
                    });

                    const sale = await tx.sale.create({
                        data: {
                            subtotal: 145000,
                            discountTotal: 0,
                            finalTotal: 145000,
                        },
                    });

                    await createAttributedLineItems(tx, {
                        saleId: sale.id,
                        services: [
                            {
                                serviceId: serviceA.id,
                                appointmentId: appointment.id,
                                employeeId: employeeA.id,
                                price: 60000,
                            },
                            {
                                serviceId: serviceB.id,
                                appointmentId: appointment.id,
                                employeeId: employeeB.id,
                                price: 60000,
                            },
                        ],
                       addons: [
                            {
                                addonId: addon.id,
                                serviceIndex: 0,
                                price: 10000,
                            },
                            {
                                addonId: addon.id,
                                serviceIndex: 1,
                                price: 15000,
                            },
                        ],
                        catalogServices: [
                            serviceA,
                            serviceB,
                        ],
                        catalogAddons: [addon],
                    });

                    const lines = await tx.saleLineItem.findMany({
                        where: { saleId: sale.id },
                        orderBy: { id: "asc" },
                    });

                    assert.equal(lines.length, 4);

                    const [manicure, pedicure, retiroManos, retiroPies] = lines;

                    // Services retain their assigned technicians.
                    assert.equal(manicure.employeeId, employeeA.id);
                    assert.equal(pedicure.employeeId, employeeB.id);

                    // Both Retiro charges use the same catalog add-on.
                    assert.equal(retiroManos.itemId, addon.id);
                    assert.equal(retiroPies.itemId, addon.id);

                    // Each Retiro retains its own price.
                    assert.equal(retiroManos.unitPrice, 10000);
                    assert.equal(retiroPies.unitPrice, 15000);

                    // Each Retiro belongs to the correct technician and service.
                    assert.equal(retiroManos.employeeId, employeeA.id);
                    assert.equal(retiroManos.parentLineItemId, manicure.id);

                    assert.equal(retiroPies.employeeId, employeeB.id);
                    assert.equal(retiroPies.parentLineItemId, pedicure.id);

                    assert.equal(manicure.appointmentId, appointment.id);
                    assert.equal(retiroManos.appointmentId, appointment.id);
                    assert.equal(retiroPies.appointmentId, appointment.id);

                    const total = lines.reduce(
                        (sum, line) => sum + line.unitPrice,
                        0
                    );

                    assert.equal(total, sale.subtotal);

                    // Deliberately roll back all temporary records.
                    throw new Error("TEST_ROLLBACK");
                },
                {
                    maxWait: 10000,
                    timeout: 20000,
                }
            ),
            /TEST_ROLLBACK/
        );

        // Verify the temporary customer was rolled back.
        const remaining = await prisma.customer.findFirst({
            where: { name: marker },
        });

        assert.equal(remaining, null);

        console.log("PASS: Attributed line items verified and rolled back.");
    } finally {
        await prisma.$disconnect();
    }
});