
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    getUniqueFinalizedSales,
} from "../src/lib/appointments/get-unique-finalized-sales";
import type {
    FinalizedAppointmentItem,
} from "../src/lib/appointments/get-finalized-appointment-items";

type TestSale = {
    id: number;
    finalTotal: number;
    lineItems: FinalizedAppointmentItem[];
    saleAppointments: {
        appointment: {
            id: number;
            customerId: number;
        };
    }[];
};

function makeSale(id: number): TestSale {
    return {
        id,
        finalTotal: 150000,
        lineItems: [
            {
                id: id * 10,
                itemType: "SERVICE",
                itemName: "Manicura Gel",
                unitPrice: 60000,
                employeeId: 10,
                appointmentId: 1,
                parentLineItemId: null,
            },
        ],
        saleAppointments: [
            {
                appointment: {
                    id: 1,
                    customerId: 100,
                },
            },
        ],
    };
}

function makeAppointment(
    id: number,
    status: string,
    sales: ReturnType<typeof makeSale>[] = [],
    employeeId = 10
) {
    return {
        id,
        status,
        employeeId,
        saleAppointments: sales.map((sale) => ({
            sale,
        })),
    };
}

test("deduplicates a sale linked to multiple appointments", () => {
    const sale = makeSale(105);

    const result = getUniqueFinalizedSales([
        makeAppointment(1, "COMPLETED", [sale]),
        makeAppointment(2, "COMPLETED", [sale]),
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 105);
});

test("deduplicates sales across multiple technicians", () => {
    const sale = makeSale(105);

    const result = getUniqueFinalizedSales([
        makeAppointment(1, "COMPLETED", [sale], 10),
        makeAppointment(2, "COMPLETED", [sale], 20),
    ]);

    assert.deepEqual(result.map((item) => item.id), [105]);
});

test("preserves separate finalized sales", () => {
    const result = getUniqueFinalizedSales([
        makeAppointment(1, "COMPLETED", [makeSale(105)]),
        makeAppointment(2, "COMPLETED", [makeSale(106)]),
    ]);

    assert.deepEqual(
        result.map((sale) => sale.id),
        [105, 106]
    );
});

test("excludes appointments without a finalized sale", () => {
    const result = getUniqueFinalizedSales([
        makeAppointment(1, "BOOKED"),
        makeAppointment(2, "COMPLETED"),
    ]);

    assert.deepEqual(result, []);
});

test("excludes non-completed appointments", () => {
    const result = getUniqueFinalizedSales([
        makeAppointment(1, "IN_PROGRESS", [makeSale(105)]),
    ]);

    assert.deepEqual(result, []);
});

test("includes legacy completed sales", () => {
    const sale = {
        ...makeSale(105),
        lineItems: [
            {
                ...makeSale(105).lineItems[0],
                employeeId: null,
                appointmentId: null,
            },
        ],
    };

    const result = getUniqueFinalizedSales([
        makeAppointment(1, "COMPLETED", [sale]),
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].lineItems[0].employeeId, null);
});

test("deduplicates repeated sale links", () => {
    const sale = makeSale(105);

    const result = getUniqueFinalizedSales([
        makeAppointment(1, "COMPLETED", [sale, sale]),
    ]);

    assert.equal(result.length, 1);
});

test("handles an empty appointment list", () => {
    assert.deepEqual(getUniqueFinalizedSales([]), []);
});

test("does not mutate appointment data", () => {
    const sale = makeSale(105);

    const appointments = [
        makeAppointment(1, "COMPLETED", [sale]),
    ];

    const original = structuredClone(appointments);

    getUniqueFinalizedSales(appointments);

    assert.deepEqual(appointments, original);
});