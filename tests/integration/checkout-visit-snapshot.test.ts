
import assert from "node:assert/strict";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";
import { assertCheckoutVisitUnchanged } from "../../src/lib/checkout/validate-visit-snapshot";

test("rejects stale checkout technician attribution using real database records", async () => {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-checkout-snapshot-${crypto.randomUUID()}`;

    try {
        await assert.rejects(
            prisma.$transaction(async (tx) => {
                const customer = await tx.customer.create({
                    data: { name: marker },
                });

                const employeeA = await tx.employee.create({
                    data: { name: `${marker}-A`, active: true },
                });

                const employeeB = await tx.employee.create({
                    data: { name: `${marker}-B`, active: true },
                });

                const service = await tx.service.create({
                    data: {
                        nameEs: marker,
                        nameEn: marker,
                        category: "TEST",
                        price: 60000,
                        estimatedDuration: 60,
                    },
                });

                const appointment = await tx.appointment.create({
                    data: {
                        customerId: customer.id,
                        employeeId: employeeA.id,
                        date: new Date("2099-01-05T00:00:00.000Z"),
                        startTime: "10:00",
                        duration: 60,
                        status: "IN_PROGRESS",
                        appointmentServices: {
                            create: {
                                serviceId: service.id,
                                bookedPrice: 60000,
                                bookedDuration: 60,
                            },
                        },
                    },
                });

                const include = {
                    appointmentServices: {
                        select: {
                            serviceId: true,
                            bookedPrice: true,
                        },
                    },
                    appointmentAddons: {
                        select: {
                            addonId: true,
                            bookedPrice: true,
                        },
                    },
                } as const;

                // Snapshot used by checkout before a technician change.
                const original = await tx.appointment.findMany({
                    where: { id: appointment.id },
                    include,
                });

                // Simulate a reassignment before checkout's final validation.
                await tx.appointment.update({
                    where: { id: appointment.id },
                    data: { employeeId: employeeB.id },
                });

                // Reload the appointment as checkout would.
                const current = await tx.appointment.findMany({
                    where: { id: appointment.id },
                    include,
                });

                assert.throws(
                    () => assertCheckoutVisitUnchanged(original, current),
                    /CHECKOUT_VISIT_CHANGED/
                );

                // The validator must not create financial records.
                assert.equal(
                    await tx.saleAppointment.count({
                        where: { appointmentId: appointment.id },
                    }),
                    0
                );

                // Roll back every test record.
                throw new Error("TEST_ROLLBACK");
            }),
            /TEST_ROLLBACK/
        );

        // Verify the transaction left no test customer behind.
        const remainingCustomer = await prisma.customer.findFirst({
            where: { name: marker },
        });

        assert.equal(remainingCustomer, null);
    } finally {
        await prisma.$disconnect();
    }
});