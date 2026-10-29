
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    getFinalizedAppointmentItems,
    type FinalizedAppointmentItem,
} from "../src/lib/appointments/get-finalized-appointment-items";

function makeItem(
    id: number,
    appointmentId: number | null,
    employeeId: number | null,
    itemType = "SERVICE"
): FinalizedAppointmentItem {
    return {
        id,
        itemType,
        itemName: `Servicio ${id}`,
        unitPrice: 60000,
        employeeId,
        appointmentId,
        parentLineItemId: null,
    };
}

function makeAppointment(
    id: number,
    employeeId = 10,
    customerId = 100
) {
    return {
        id,
        employeeId,
        customer: { id: customerId },
    };
}

function makeSale(
    lineItems: FinalizedAppointmentItem[],
    customerIds: number[] = [100]
) {
    return {
        lineItems,
        saleAppointments: customerIds.map(
            (customerId, index) => ({
                appointment: {
                    id: index + 1,
                    customerId,
                },
            })
        ),
    };
}

test("includes items directly linked to the appointment", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1),
        makeSale([makeItem(1, 1, 10)])
    );

    assert.deepEqual(items.map((item) => item.id), [1]);
});

test("excludes items linked to another appointment", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1),
        makeSale([makeItem(1, 2, 10)])
    );

    assert.deepEqual(items, []);
});

test("includes checkout-added item with one clear appointment", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1),
        makeSale([
            makeItem(1, 1, 10),
            makeItem(2, null, 10),
        ])
    );

    assert.deepEqual(items.map((item) => item.id), [1, 2]);
});

test("does not guess ownership when several appointments are linked", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1),
        makeSale(
            [
                makeItem(1, 1, 10),
                makeItem(2, 2, 10),
                makeItem(3, null, 10),
            ],
            [100, 100]
        )
    );

    assert.deepEqual(items.map((item) => item.id), [1]);
});

test("does not assign legacy items without attribution", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1),
        makeSale([
            makeItem(1, null, null),
        ])
    );

    assert.deepEqual(items, []);
});

test("does not assign another technician's checkout-added item", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1, 10),
        makeSale([
            makeItem(1, 1, 10),
            makeItem(2, null, 20),
        ])
    );

    assert.deepEqual(items.map((item) => item.id), [1]);
});

test("preserves directly linked items after technician reassignment", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1, 10),
        makeSale([
            makeItem(1, 1, 20),
        ])
    );

    assert.deepEqual(items.map((item) => item.id), [1]);
    assert.equal(items[0].employeeId, 20);
});

test("preserves add-ons directly linked to the appointment", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1),
        makeSale([
            makeItem(1, 1, 10),
            {
                ...makeItem(2, 1, 10, "ADDON"),
                parentLineItemId: 1,
            },
        ])
    );

    assert.equal(items.length, 2);
    assert.equal(items[1].parentLineItemId, 1);
});

test("handles a sale without finalized line items", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1),
        makeSale([])
    );

    assert.deepEqual(items, []);
});


test("includes checkout-added items when the sale has one appointment", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1, 10),
        makeSale([
            makeItem(1, null, 10),
        ])
    );

    assert.deepEqual(
        items.map((item) => item.id),
        [1]
    );
});

test("does not assign checkout-added items when sale has multiple appointments", () => {
    const items = getFinalizedAppointmentItems(
        makeAppointment(1, 10),
        makeSale(
            [
                makeItem(1, 1, 10),
                makeItem(2, null, 10),
            ],
            [100, 100]
        )
    );

    assert.deepEqual(
        items.map((item) => item.id),
        [1]
    );
});