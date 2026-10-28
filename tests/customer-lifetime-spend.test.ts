
import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateLifetimeSpend } from "../src/lib/customers/calculate-lifetime-spend";

const customerId = 10;

function makeSale(
    id: number,
    finalTotal: number,
    customerIds: number[]
) {
    return {
        id,
        finalTotal,
        saleAppointments: customerIds.map((id) => ({
            appointment: { customerId: id },
        })),
    };
}

function makeAppointment(
    ...sales: ReturnType<typeof makeSale>[]
) {
    return {
        saleAppointments: sales.map((sale) => ({ sale })),
    };
}

test("counts one sale linked to one appointment", () => {
    const result = calculateLifetimeSpend(customerId, [
        makeAppointment(makeSale(1, 60000, [customerId])),
    ]);

    assert.equal(result.lifetimeSpend, 60000);
    assert.deepEqual(result.ambiguousSaleIds, []);
});

test("counts a shared sale only once across appointments", () => {
    const sale = makeSale(2, 120000, [
        customerId,
        customerId,
    ]);

    const result = calculateLifetimeSpend(customerId, [
        makeAppointment(sale),
        makeAppointment(sale),
    ]);

    assert.equal(result.lifetimeSpend, 120000);
    assert.deepEqual(result.ambiguousSaleIds, []);
});

test("sums distinct completed sales", () => {
    const result = calculateLifetimeSpend(customerId, [
        makeAppointment(makeSale(3, 60000, [customerId])),
        makeAppointment(makeSale(4, 100000, [customerId])),
    ]);

    assert.equal(result.lifetimeSpend, 160000);
});

test("excludes sales linked to multiple customers", () => {
    const result = calculateLifetimeSpend(customerId, [
        makeAppointment(
            makeSale(5, 120000, [customerId, 20])
        ),
    ]);

    assert.equal(result.lifetimeSpend, 0);
    assert.deepEqual(result.ambiguousSaleIds, [5]);
});

test("excludes sales with missing ownership records", () => {
    const result = calculateLifetimeSpend(customerId, [
        makeAppointment(makeSale(6, 80000, [])),
    ]);

    assert.equal(result.lifetimeSpend, 0);
    assert.deepEqual(result.ambiguousSaleIds, [6]);
});

test("handles customers with no completed sales", () => {
    const result = calculateLifetimeSpend(customerId, []);

    assert.equal(result.lifetimeSpend, 0);
    assert.deepEqual(result.ambiguousSaleIds, []);
});

test("counts verified sales while flagging ambiguous ones", () => {
    const result = calculateLifetimeSpend(customerId, [
        makeAppointment(makeSale(7, 60000, [customerId])),
        makeAppointment(makeSale(8, 90000, [customerId, 20])),
    ]);

    assert.equal(result.lifetimeSpend, 60000);
    assert.deepEqual(result.ambiguousSaleIds, [8]);
});