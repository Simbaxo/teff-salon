
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";
import { loadCheckoutAssignmentContext } from "../../src/lib/checkout/load-assignment-context";
import { validateCheckoutAssignments } from "../../src/lib/checkout/validate-assignments";

test("loads and validates assignments from Neon Development", async () => {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-context-${randomUUID()}`;

    try {
        await assert.rejects(
            prisma.$transaction(
                async (tx) => {
                    // All fixtures are created inside a rollback-only transaction.
                    const customer = await tx.customer.create({
                        data: { name: marker },
                    });

                    const activeEmployee = await tx.employee.create({
                        data: {
                            name: `${marker}-active`,
                            active: true,
                        },
                    });

                    const inactiveEmployee = await tx.employee.create({
                        data: {
                            name: `${marker}-inactive`,
                            active: false,
                        },
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

                    const addon = await tx.addon.create({
                        data: {
                            nameEs: marker,
                            nameEn: marker,
                            price: 15000,
                            estimatedDuration: 15,
                        },
                    });

                    await tx.employeeService.createMany({
                        data: [
                            {
                                employeeId: activeEmployee.id,
                                serviceId: service.id,
                            },
                            {
                                employeeId: inactiveEmployee.id,
                                serviceId: service.id,
                            },
                        ],
                    });

                    await tx.serviceAddon.create({
                        data: {
                            serviceId: service.id,
                            addonId: addon.id,
                        },
                    });

                    const appointment = await tx.appointment.create({
                        data: {
                            customerId: customer.id,
                            employeeId: activeEmployee.id,
                            date: new Date("2099-01-05T00:00:00.000Z"),
                            startTime: "10:00",
                            duration: 60,
                            status: "IN_PROGRESS",
                        },
                    });

                    await tx.appointmentService.create({
                        data: {
                            appointmentId: appointment.id,
                            serviceId: service.id,
                            bookedPrice: 60000,
                            bookedDuration: 60,
                        },
                    });

                    const services = [{
                        serviceId: service.id,
                        appointmentId: appointment.id,
                        employeeId: activeEmployee.id,
                        price: 60000,
                    }];

                    const addons = [{
                        addonId: addon.id,
                        serviceIndex: 0,
                        price: 15000,
                    }];

                    const context = await loadCheckoutAssignmentContext(
                        tx,
                        {
                            appointmentIds: [appointment.id],
                            services,
                            addons,
                        }
                    );

                    assert.deepEqual(
                        context.activeEmployeeIds,
                        [activeEmployee.id]
                    );

                    assert.equal(context.bookedServices.length, 1);
                    assert.equal(
                        context.bookedServices[0].employeeId,
                        activeEmployee.id
                    );

                    assert.equal(context.employeeServices.length, 1);
                    assert.equal(context.serviceAddons.length, 1);

                    // Valid assignments must pass server-side validation.
                    assert.doesNotThrow(() =>
                        validateCheckoutAssignments(
                            services,
                            addons,
                            context
                        )
                    );

                    // Inactive technicians must not receive assignments.
                    const inactiveServices = [{
                        ...services[0],
                        employeeId: inactiveEmployee.id,
                    }];

                    const inactiveContext =
                        await loadCheckoutAssignmentContext(tx, {
                            appointmentIds: [appointment.id],
                            services: inactiveServices,
                            addons,
                        });

                    assert.throws(
                        () => validateCheckoutAssignments(
                            inactiveServices,
                            addons,
                            inactiveContext
                        ),
                        /Inactive or unknown technician/
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

        const remaining = await prisma.customer.findFirst({
            where: { name: marker },
        });

        assert.equal(remaining, null);
    } finally {
        await prisma.$disconnect();
    }
});