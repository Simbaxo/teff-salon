
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
    Prisma,
    PrismaClient,
} from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";
import { lockPayrollWeek } from "../../src/lib/payroll/period-lock";
import { assertAppointmentNotSold } from "../../src/lib/appointments/reassignment-safety";
import { assertCheckoutVisitUnchanged } from "../../src/lib/checkout/validate-visit-snapshot";

// Coordinate transactions without arbitrary delays.
function createSignal() {
    let release!: () => void;

    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });

    return { promise, release };
}

test("rejects stale checkout after a competing technician reassignment", async () => {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-concurrency-${randomUUID()}`;
    const week = new Date("2099-01-05T00:00:00.000Z");

    const firstHasLock = createSignal();
    const releaseFirst = createSignal();
    const secondStarted = createSignal();

    let customerId: number | null = null;
    let employeeAId: number | null = null;
    let employeeBId: number | null = null;
    let appointmentId: number | null = null;

    let firstTransaction: Promise<unknown> | undefined;
    let secondTransaction: Promise<unknown> | undefined;

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

    try {
        // Create isolated records before competing transactions begin.
        const customer = await prisma.customer.create({
            data: { name: marker },
        });
        customerId = customer.id;

        const employeeA = await prisma.employee.create({
            data: { name: `${marker}-A`, active: true },
        });
        employeeAId = employeeA.id;

        const employeeB = await prisma.employee.create({
            data: { name: `${marker}-B`, active: true },
        });
        employeeBId = employeeB.id;

        const appointment = await prisma.appointment.create({
            data: {
                customerId: customer.id,
                employeeId: employeeA.id,
                date: week,
                startTime: "10:00",
                duration: 60,
                status: "IN_PROGRESS",
            },
        });
        appointmentId = appointment.id;

        // Checkout initially sees Technician A.
        const original = await prisma.appointment.findMany({
            where: { id: appointment.id },
            include,
        });

        // Transaction A acquires the payroll lock and reassigns.
        firstTransaction = prisma.$transaction(
            async (tx) => {
                await lockPayrollWeek(tx, week);

                await tx.appointment.update({
                    where: { id: appointment.id },
                    data: { employeeId: employeeB.id },
                });

                firstHasLock.release();

                // Keep the change uncommitted until checkout starts.
                await releaseFirst.promise;
            },
            {
                isolationLevel: "Serializable",
                timeout: 15000,
            }
        );

        await firstHasLock.promise;

        // Transaction B attempts checkout using its old snapshot.
        secondTransaction = prisma.$transaction(
            async (tx) => {
                secondStarted.release();

                await lockPayrollWeek(tx, week);

                // Match checkout's production row-locking behavior.
                // A concurrent update must cause a safe conflict
                // instead of allowing stale financial attribution.
                const lockedAppointments = await tx.$queryRaw<
                    { id: number }[]
                >`
                    SELECT id
                    FROM "Appointment"
                    WHERE id IN (${Prisma.join([appointment.id])})
                    ORDER BY id
                    FOR UPDATE
                `;

                if (lockedAppointments.length !== 1) {
                    throw new Error("CHECKOUT_VISIT_CHANGED");
                }


                const current = await tx.appointment.findMany({
                    where: { id: appointment.id },
                    include,
                });

                // Diagnose which technician checkout sees after acquiring the lock.
                console.log("Original technician:", original[0]?.employeeId);
                console.log("Current technician:", current[0]?.employeeId);
                console.log("Expected new technician:", employeeB.id);

                // Reject before any sale or commission is created.
                assertCheckoutVisitUnchanged(original, current);
            },
            {
                isolationLevel: "Serializable",
                timeout: 15000,
            }
        );

        await secondStarted.promise;
        releaseFirst.release();

        await firstTransaction;

        // PostgreSQL may report a serialization conflict instead.
        await assert.rejects(
            secondTransaction,
            (error: unknown) =>
                error instanceof Error &&
                (
                    error.message.includes("CHECKOUT_VISIT_CHANGED") ||
                    (
                        "code" in error &&
                        error.code === "P2034"
                    )
                )
        );

        const savedAppointment =
            await prisma.appointment.findUniqueOrThrow({
                where: { id: appointment.id },
            });

        assert.equal(savedAppointment.employeeId, employeeB.id);

        assert.equal(
            await prisma.saleAppointment.count({
                where: { appointmentId: appointment.id },
            }),
            0
        );

        console.log(
            "PASS: Stale checkout rejected after reassignment."
        );
    } finally {
        releaseFirst.release();

        // Wait for started transactions to settle before cleanup.
        await Promise.allSettled(
            [firstTransaction, secondTransaction].filter(
                (value): value is Promise<unknown> =>
                    value !== undefined
            )
        );

        try {
            if (appointmentId !== null) {
                await prisma.appointment.delete({
                    where: { id: appointmentId },
                });
            }

            if (customerId !== null) {
                await prisma.customer.delete({
                    where: { id: customerId },
                });
            }

            if (employeeAId !== null) {
                await prisma.employee.delete({
                    where: { id: employeeAId },
                });
            }

            if (employeeBId !== null) {
                await prisma.employee.delete({
                    where: { id: employeeBId },
                });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});


test("blocks reassignment when checkout commits first", async () => {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-checkout-first-${randomUUID()}`;
    const week = new Date("2099-01-05T00:00:00.000Z");

    const checkoutHasLock = createSignal();
    const releaseCheckout = createSignal();
    const reassignmentStarted = createSignal();

    let customerId: number | null = null;
    let employeeAId: number | null = null;
    let employeeBId: number | null = null;
    let appointmentId: number | null = null;
    let saleId: number | null = null;

    let checkoutTransaction: Promise<unknown> | undefined;
    let reassignmentTransaction: Promise<unknown> | undefined;

    try {
        // Create records belonging exclusively to this test.
        const customer = await prisma.customer.create({
            data: { name: marker },
        });
        customerId = customer.id;

        const employeeA = await prisma.employee.create({
            data: { name: `${marker}-A`, active: true },
        });
        employeeAId = employeeA.id;

        const employeeB = await prisma.employee.create({
            data: { name: `${marker}-B`, active: true },
        });
        employeeBId = employeeB.id;

        const appointment = await prisma.appointment.create({
            data: {
                customerId: customer.id,
                employeeId: employeeA.id,
                date: week,
                startTime: "12:00",
                duration: 60,
                status: "IN_PROGRESS",
            },
        });
        appointmentId = appointment.id;

        // Transaction A completes checkout while holding the payroll lock.
        checkoutTransaction = prisma.$transaction(
            async (tx) => {
                await lockPayrollWeek(tx, week);

                const sale = await tx.sale.create({
                    data: {
                        subtotal: 60000,
                        discountTotal: 0,
                        finalTotal: 60000,
                    },
                });

                saleId = sale.id;

                await tx.saleAppointment.create({
                    data: {
                        saleId: sale.id,
                        appointmentId: appointment.id,
                    },
                });

                await tx.commission.create({
                    data: {
                        saleId: sale.id,
                        employeeId: employeeA.id,
                        commissionBase: 60000,
                        commissionRate: 50,
                        commissionAmount: 30000,
                    },
                });

                checkoutHasLock.release();

                // Hold checkout open until reassignment begins.
                await releaseCheckout.promise;
            },
            {
                isolationLevel: "Serializable",
                maxWait: 10000,
                timeout: 15000,
            }
        );

        await checkoutHasLock.promise;

        // Transaction B attempts reassignment while checkout holds the lock.
        reassignmentTransaction = prisma.$transaction(
            async (tx) => {
                reassignmentStarted.release();

                await lockPayrollWeek(tx, week);

                // A completed sale must prevent technician changes.
                await assertAppointmentNotSold(tx, appointment.id);

                await tx.appointment.update({
                    where: { id: appointment.id },
                    data: { employeeId: employeeB.id },
                });
            },
            {
                isolationLevel: "Serializable",
                maxWait: 10000,
                timeout: 15000,
            }
        );

        await reassignmentStarted.promise;
        releaseCheckout.release();

        await checkoutTransaction;

        // Either the sold-appointment guard or PostgreSQL must reject.
        await assert.rejects(
            reassignmentTransaction,
            (error: unknown) =>
                error instanceof Error &&
                (
                    error.message.includes(
                        "SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED"
                    ) ||
                    (
                        "code" in error &&
                        error.code === "P2034"
                    )
                )
        );

        const savedAppointment =
            await prisma.appointment.findUniqueOrThrow({
                where: { id: appointment.id },
            });

        assert.equal(savedAppointment.employeeId, employeeA.id);

        // Checkout must have committed a sale before checking commissions.
        if (saleId === null) {
            throw new Error("Checkout did not create a sale");
        }

        const commissions = await prisma.commission.findMany({
            where: { saleId },
        });

        assert.equal(commissions.length, 1);
        assert.equal(commissions[0].employeeId, employeeA.id);
        assert.equal(commissions[0].commissionAmount, 30000);

        console.log(
            "PASS: Checkout financial ownership preserved."
        );
    } finally {
        releaseCheckout.release();

        // Wait for transactions to settle before deleting test records.
        await Promise.allSettled(
            [checkoutTransaction, reassignmentTransaction].filter(
                (value): value is Promise<unknown> =>
                    value !== undefined
            )
        );

        try {
            if (saleId !== null) {
                await prisma.commission.deleteMany({
                    where: { saleId },
                });

                await prisma.saleAppointment.deleteMany({
                    where: { saleId },
                });

                await prisma.sale.delete({
                    where: { id: saleId },
                });
            }

            if (appointmentId !== null) {
                await prisma.appointment.delete({
                    where: { id: appointmentId },
                });
            }

            if (customerId !== null) {
                await prisma.customer.delete({
                    where: { id: customerId },
                });
            }

            if (employeeAId !== null) {
                await prisma.employee.delete({
                    where: { id: employeeAId },
                });
            }

            if (employeeBId !== null) {
                await prisma.employee.delete({
                    where: { id: employeeBId },
                });
            }
        } finally {
            await prisma.$disconnect();
        }
    }
});