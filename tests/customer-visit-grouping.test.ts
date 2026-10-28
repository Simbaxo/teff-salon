
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    groupCustomerVisits,
    type VisitAppointment,
} from "../src/lib/customers/group-customer-visits";

function makeAppointment(
    id: number,
    bookingId: number | null,
    status: string,
    saleId: number | null = null
): VisitAppointment {
    return {
        id,
        bookingId,
        status,
        saleAppointments:
            saleId === null
                ? []
                : [
                    {
                        sale: {
                            id: saleId,
                            finalTotal: 120000,
                        },
                    },
                ],
    };
}

test("groups multiple completed appointments under one sale", () => {
    const groups = groupCustomerVisits([
        makeAppointment(101, 10, "COMPLETED", 91),
        makeAppointment(102, 10, "COMPLETED", 91),
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].saleId, 91);
    assert.deepEqual(
        groups[0].appointments.map((item) => item.id),
        [101, 102]
    );
});

test("keeps different sales separate", () => {
    const groups = groupCustomerVisits([
        makeAppointment(101, 10, "COMPLETED", 91),
        makeAppointment(102, 20, "COMPLETED", 92),
    ]);

    assert.equal(groups.length, 2);
    assert.deepEqual(
        groups.map((group) => group.saleId),
        [91, 92]
    );
});

test("groups appointments sharing a booking without a sale", () => {
    const groups = groupCustomerVisits([
        makeAppointment(101, 10, "BOOKED"),
        makeAppointment(102, 10, "BOOKED"),
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].bookingId, 10);
    assert.equal(groups[0].saleId, null);
    assert.equal(groups[0].appointments.length, 2);
});

test("keeps standalone legacy appointments separate", () => {
    const groups = groupCustomerVisits([
        makeAppointment(101, null, "COMPLETED"),
        makeAppointment(102, null, "COMPLETED"),
    ]);

    assert.equal(groups.length, 2);
    assert.notEqual(groups[0].key, groups[1].key);
});

test("does not combine paid and unpaid appointment groups", () => {
    const groups = groupCustomerVisits([
        makeAppointment(101, 10, "COMPLETED", 91),
        makeAppointment(102, 10, "BOOKED"),
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0].saleId, 91);
    assert.equal(groups[1].saleId, null);
});

test("preserves individual appointment statuses", () => {
    const groups = groupCustomerVisits([
        makeAppointment(101, 10, "BOOKED"),
        makeAppointment(102, 10, "REQUESTED"),
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(
        groups[0].appointments.map((item) => item.status),
        ["BOOKED", "REQUESTED"]
    );
});

test("handles an empty appointment history", () => {
    const groups = groupCustomerVisits([]);

    assert.deepEqual(groups, []);
});