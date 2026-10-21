
import assert from "node:assert/strict";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";
import { assertAppointmentNotSold } from "../../src/lib/appointments/reassignment-safety";

test("blocks sold appointments without changing financial records", async () => {
    // Reject production or unauthorized database connections.
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-reassignment-${crypto.randomUUID()}`;

    try {
        await assert.rejects(
            prisma.$transaction(async (tx) => {
                // Create isolated test records.
                const customer = await tx.customer.create({
                    data: {
                        name: marker,
                    },
                });

                const employee = await tx.employee.create({
                    data: {
                        name: marker,
                        active: true,
                    },
                });

                const appointment = await tx.appointment.create({
                    data: {
                        customerId: customer.id,
                        employeeId: employee.id,
                        date: new Date("2099-01-05T00:00:00.000Z"),
                        startTime: "10:00",
                        duration: 60,
                        status: "COMPLETED",
                    },
                });

                // An unsold appointment is eligible for reassignment.
                await assertAppointmentNotSold(tx, appointment.id);

                const sale = await tx.sale.create({
                    data: {
                        subtotal: 60000,
                        discountTotal: 0,
                        finalTotal: 60000,
                    },
                });

                await tx.saleAppointment.create({
                    data: {
                        saleId: sale.id,
                        appointmentId: appointment.id,
                    },
                });

                const commission = await tx.commission.create({
                    data: {
                        saleId: sale.id,
                        employeeId: employee.id,
                        commissionBase: 60000,
                        commissionRate: 50,
                        commissionAmount: 30000,
                    },
                });

                const tip = await tx.tip.create({
                    data: {
                        saleId: sale.id,
                        employeeId: employee.id,
                        amount: 10000,
                        paymentMethod: "TRANSFER",
                    },
                });

                // Verify that a sold appointment is rejected.
                await assert.rejects(
                    assertAppointmentNotSold(tx, appointment.id),
                    /SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED/
                );

                // Financial ownership must remain unchanged.
                const savedCommission =
                    await tx.commission.findUniqueOrThrow({
                        where: { id: commission.id },
                    });

                const savedTip = await tx.tip.findUniqueOrThrow({
                    where: { id: tip.id },
                });

                const savedAppointment =
                    await tx.appointment.findUniqueOrThrow({
                        where: { id: appointment.id },
                    });

                assert.equal(
                    savedCommission.employeeId,
                    employee.id
                );

                assert.equal(savedCommission.commissionAmount, 30000);
                assert.equal(savedTip.employeeId, employee.id);
                assert.equal(savedTip.amount, 10000);
                assert.equal(savedAppointment.employeeId, employee.id);

                throw new Error("TEST_ROLLBACK");
                }, {
                    maxWait: 10000,
                    timeout: 15000,
                }),
                /TEST_ROLLBACK/
        );

        // Confirm the rollback removed our test customer.
        const remainingCustomer = await prisma.customer.findFirst({
            where: { name: marker },
        });

        assert.equal(remainingCustomer, null);
    } finally {
        await prisma.$disconnect();
    }
});