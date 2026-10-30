
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { getSafeTestDatabaseUrl } from "../helpers/test-database";
import { checkSlotAvailability } from "../../src/lib/booking/check-slot-availability";

test("finds a technician available for the complete nail booking", async () => {
    // Refuse unsafe database connections before opening Prisma.
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-booking-${randomUUID()}`;

    try {
        await assert.rejects(
            prisma.$transaction(
                async (tx) => {
                    const customer = await tx.customer.create({
                        data: { name: marker },
                    });

                    const technicianA = await tx.employee.create({
                        data: {
                            name: `${marker}-A`,
                            active: true,
                            isBookable: true,
                        },
                    });

                    const technicianB = await tx.employee.create({
                        data: {
                            name: `${marker}-B`,
                            active: true,
                            isBookable: true,
                        },
                    });

                    const manicure = await tx.service.create({
                        data: {
                            nameEs: `${marker}-Manicura`,
                            nameEn: "Manicure",
                            category: "NAILS",
                            price: 60000,
                            estimatedDuration: 60,
                        },
                    });

                    const pedicure = await tx.service.create({
                        data: {
                            nameEs: `${marker}-Pedicura`,
                            nameEn: "Pedicure",
                            category: "NAILS",
                            price: 60000,
                            estimatedDuration: 60,
                        },
                    });

                    const addon = await tx.addon.create({
                        data: {
                            nameEs: `${marker}-Complemento`,
                            nameEn: "Add-on",
                            price: 10000,
                            estimatedDuration: 30,
                        },
                    });

                    await tx.employeeService.createMany({
                        data: [technicianA, technicianB].flatMap(
                            (employee) =>
                                [manicure, pedicure].map((service) => ({
                                    employeeId: employee.id,
                                    serviceId: service.id,
                                }))
                        ),
                    });

                    // Technician A is busy during the pedicure.
                    const serviceDate = new Date(
                        "2099-01-05T00:00:00.000Z"
                    );

                    await tx.appointment.create({
                        data: {
                            customerId: customer.id,
                            employeeId: technicianA.id,
                            date: serviceDate,
                            startTime: "11:30",
                            duration: 60,
                            status: "BOOKED",
                        },
                    });

                    const existing = await tx.appointment.findMany({
                        where: {
                            date: serviceDate,
                            employeeId: {
                                in: [
                                    technicianA.id,
                                    technicianB.id,
                                ],
                            },
                            status: {
                                in: [
                                    "BOOKED",
                                    "REQUESTED",
                                    "CHECKED_IN",
                                    "IN_PROGRESS",
                                ],
                            },
                        },
                    });

                    const availability = checkSlotAvailability({
                        startMinutes: 600,
                        blocks: [
                            {
                                serviceId: manicure.id,
                                category: "NAILS",
                                duration:
                                    manicure.estimatedDuration +
                                    addon.estimatedDuration,
                                requestedEmployeeId: "any",
                                qualifiedEmployeeIds: [
                                    technicianA.id,
                                    technicianB.id,
                                ],
                            },
                            {
                                serviceId: pedicure.id,
                                category: "NAILS",
                                duration: pedicure.estimatedDuration,
                                requestedEmployeeId: "any",
                                qualifiedEmployeeIds: [
                                    technicianA.id,
                                    technicianB.id,
                                ],
                            },
                        ],
                        busyIntervals: existing.map((appointment) => {
                            const [hours, minutes] =
                                appointment.startTime.split(":").map(Number);

                            const start = hours * 60 + minutes;

                            return {
                                employeeId: appointment.employeeId,
                                startMinutes: start,
                                endMinutes:
                                    start + appointment.duration,
                            };
                        }),
                    });

                    assert.equal(availability.available, true);

                    assert.deepEqual(
                        availability.assignments.map(
                            (item) => item.employeeId
                        ),
                        [technicianB.id, technicianB.id]
                    );

                    assert.deepEqual(
                        availability.assignments.map((item) => [
                            item.startMinutes,
                            item.endMinutes,
                        ]),
                        [
                            [600, 690],
                            [690, 750],
                        ]
                    );

                    // Never commit temporary test records.
                    throw new Error("TEST_ROLLBACK");
                },
                {
                    maxWait: 10000,
                    timeout: 20000,
                }
            ),
            /TEST_ROLLBACK/
        );

        // Confirm the transaction did not leave a customer.
        const remainingCustomer = await prisma.customer.findFirst({
            where: { name: marker },
        });

        assert.equal(remainingCustomer, null);
    } finally {
        await prisma.$disconnect();
    }
});


test("development booking tests have no active staff push subscriptions", async () => {
    // Validate the approved test database before connecting.
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    try {
        const subscriptions = await prisma.pushSubscription.findMany({
            where: {
                user: {
                    active: true,
                    role: {
                        in: ["OWNER", "RECEPTIONIST"],
                    },
                },
            },
            select: {
                user: {
                    select: {
                        role: true,
                    },
                },
            },
        });

        const activeSubscriptions = subscriptions.length;

        console.log(
            "Active Development subscription roles:",
            subscriptions.map((subscription) => subscription.user.role)
        );

        assert.equal(
            activeSubscriptions,
            0,
            "STOP: Development has active staff push subscriptions. Do not run booking API tests."
        );
    } finally {
        await prisma.$disconnect();
    }
});