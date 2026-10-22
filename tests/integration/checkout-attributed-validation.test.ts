
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";
import { validateAttributedCheckout } from "../../src/lib/checkout/validate-attributed-checkout";

test("validates multi-technician checkout financials in Neon Development", async () => {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-attributed-${randomUUID()}`;

    try {
        await assert.rejects(
            prisma.$transaction(
                async (tx) => {
                    // Create isolated records inside a rollback-only transaction.
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

                    await tx.employeeService.createMany({
                        data: [
                            {
                                employeeId: employeeA.id,
                                serviceId: serviceA.id,
                            },
                            {
                                employeeId: employeeB.id,
                                serviceId: serviceB.id,
                            },
                        ],
                    });

                    await tx.serviceAddon.create({
                        data: {
                            serviceId: serviceA.id,
                            addonId: addon.id,
                        },
                    });

                    const appointmentA = await tx.appointment.create({
                        data: {
                            customerId: customer.id,
                            employeeId: employeeA.id,
                            date: new Date("2099-01-05T00:00:00.000Z"),
                            startTime: "10:00",
                            duration: 60,
                            status: "IN_PROGRESS",
                        },
                    });

                    const appointmentB = await tx.appointment.create({
                        data: {
                            customerId: customer.id,
                            employeeId: employeeB.id,
                            date: new Date("2099-01-05T00:00:00.000Z"),
                            startTime: "11:00",
                            duration: 60,
                            status: "IN_PROGRESS",
                        },
                    });

                    await tx.appointmentService.createMany({
                        data: [
                            {
                                appointmentId: appointmentA.id,
                                serviceId: serviceA.id,
                                bookedPrice: 60000,
                                bookedDuration: 60,
                            },
                            {
                                appointmentId: appointmentB.id,
                                serviceId: serviceB.id,
                                bookedPrice: 60000,
                                bookedDuration: 60,
                            },
                        ],
                    });

                    const services = [
                        {
                            serviceId: serviceA.id,
                            appointmentId: appointmentA.id,
                            employeeId: employeeA.id,
                            price: 60000,
                        },
                        {
                            serviceId: serviceB.id,
                            appointmentId: appointmentB.id,
                            employeeId: employeeB.id,
                            price: 60000,
                        },
                    ];

                    const addons = [{
                        addonId: addon.id,
                        serviceIndex: 0,
                        price: 15000,
                    }];

                    const input = {
                        appointmentIds: [
                            appointmentA.id,
                            appointmentB.id,
                        ],
                        services,
                        addons,
                        selectedServiceIds: [
                            serviceA.id,
                            serviceB.id,
                        ],
                        selectedAddonIds: [addon.id],
                        servicePrices: services.map((item) => ({
                            serviceId: item.serviceId,
                            price: item.price,
                        })),
                        addonPrices: [{
                            addonId: addon.id,
                            price: 15000,
                        }],
                        discountTotal: 15000,
                        tips: [{ employeeId: employeeB.id }],
                    };

                    const result = await validateAttributedCheckout(
                        tx,
                        input
                    );

                    assert.equal(result.subtotal, 135000);
                    assert.equal(result.finalTotal, 120000);
                    assert.equal(result.commissions.length, 2);

                    const commissionByEmployee = new Map(
                        result.commissions.map((item) => [
                            item.employeeId,
                            item,
                        ])
                    );

                    assert.equal(
                        commissionByEmployee.get(employeeA.id)?.commissionBase,
                        66667
                    );

                    assert.equal(
                        commissionByEmployee.get(employeeB.id)?.commissionBase,
                        53333
                    );

                    assert.equal(
                        result.commissions.reduce(
                            (total, item) => total + item.commissionBase,
                            0
                        ),
                        result.finalTotal
                    );

                    // Reject an invalid technician assignment.
                    const invalidServices = [
                        {
                            ...services[0],
                            employeeId: employeeB.id,
                        },
                        services[1],
                    ];

                    await assert.rejects(
                        validateAttributedCheckout(tx, {
                            ...input,
                            services: invalidServices,
                        }),
                        /Technician is not qualified/
                    );

                    // Roll back every temporary record.
                    throw new Error("TEST_ROLLBACK");
                },
                {
                    maxWait: 10000,
                    timeout: 20000,
                }
            ),
            /TEST_ROLLBACK/
        );

        // Confirm the rollback removed the test customer.
        const remaining = await prisma.customer.findFirst({
            where: { name: marker },
        });

        assert.equal(remaining, null);

        console.log(
            "PASS: Multi-technician checkout validation and rollback."
        );
    } finally {
        await prisma.$disconnect();
    }
});