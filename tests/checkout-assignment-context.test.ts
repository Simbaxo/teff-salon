
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Prisma } from "../src/generated/prisma/client";
import { loadCheckoutAssignmentContext } from "../src/lib/checkout/load-assignment-context";

function createMockTransaction() {
    const calls: {
        appointments: unknown[];
        employees: unknown[];
        qualifications: unknown[];
        addons: unknown[];
    } = {
        appointments: [],
        employees: [],
        qualifications: [],
        addons: [],
    };

    const tx = {
        appointmentService: {
            findMany: async (args: unknown) => {
                calls.appointments.push(args);

                return [
                    {
                        appointmentId: 101,
                        serviceId: 10,
                        appointment: { employeeId: 1 },
                    },
                ];
            },
        },
        employee: {
            findMany: async (args: unknown) => {
                calls.employees.push(args);

                return [{ id: 1 }, { id: 2 }];
            },
        },
        employeeService: {
            findMany: async (args: unknown) => {
                calls.qualifications.push(args);

                return [
                    { employeeId: 1, serviceId: 10 },
                    { employeeId: 2, serviceId: 20 },
                ];
            },
        },
        serviceAddon: {
            findMany: async (args: unknown) => {
                calls.addons.push(args);

                return [{ serviceId: 10, addonId: 5 }];
            },
        },
    } as unknown as Prisma.TransactionClient;

    return { tx, calls };
}

const input = {
    appointmentIds: [101, 102],
    services: [
        {
            serviceId: 10,
            appointmentId: 101,
            employeeId: 1,
            price: 60000,
        },
        {
            serviceId: 20,
            appointmentId: null,
            employeeId: 2,
            price: 60000,
        },
    ],
    addons: [
        {
            addonId: 5,
            serviceIndex: 0,
            price: 15000,
        },
    ],
};

test("loads booked services and original appointment technicians", async () => {
    const { tx, calls } = createMockTransaction();

    const result = await loadCheckoutAssignmentContext(tx, input);

    assert.deepEqual(result.bookedServices, [
        {
            appointmentId: 101,
            serviceId: 10,
            employeeId: 1,
        },
    ]);

    assert.equal(calls.appointments.length, 1);
});

test("loads active technician IDs", async () => {
    const { tx, calls } = createMockTransaction();

    const result = await loadCheckoutAssignmentContext(tx, input);

    assert.deepEqual(result.activeEmployeeIds, [1, 2]);
    assert.equal(calls.employees.length, 1);
});

test("loads technician qualifications", async () => {
    const { tx, calls } = createMockTransaction();

    const result = await loadCheckoutAssignmentContext(tx, input);

    assert.deepEqual(result.employeeServices, [
        { employeeId: 1, serviceId: 10 },
        { employeeId: 2, serviceId: 20 },
    ]);

    assert.equal(calls.qualifications.length, 1);
});

test("loads service and add-on relationships", async () => {
    const { tx, calls } = createMockTransaction();

    const result = await loadCheckoutAssignmentContext(tx, input);

    assert.deepEqual(result.serviceAddons, [
        { serviceId: 10, addonId: 5 },
    ]);

    assert.equal(calls.addons.length, 1);
});

test("preserves the verified appointment IDs", async () => {
    const { tx } = createMockTransaction();

    const result = await loadCheckoutAssignmentContext(tx, input);

    assert.deepEqual(result.appointmentIds, [101, 102]);
});

test("deduplicates technician and service IDs in queries", async () => {
    const { tx, calls } = createMockTransaction();

    await loadCheckoutAssignmentContext(tx, {
        ...input,
        services: [
            input.services[0],
            { ...input.services[0] },
            input.services[1],
        ],
    });

    const employeeQuery = calls.employees[0] as {
        where: { id: { in: number[] } };
    };

    const qualificationQuery = calls.qualifications[0] as {
        where: {
            employeeId: { in: number[] };
            serviceId: { in: number[] };
        };
    };

    assert.deepEqual(employeeQuery.where.id.in, [1, 2]);
    assert.deepEqual(
        qualificationQuery.where.serviceId.in,
        [10, 20]
    );
});