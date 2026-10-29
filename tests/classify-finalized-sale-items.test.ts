
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    classifyFinalizedSaleItems,
} from "../src/lib/appointments/classify-finalized-sale-items";

import type {
    FinalizedAppointmentItem,
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
    items: FinalizedAppointmentItem[],
    links: { id: number; customerId: number }[] = [
        { id: 1, customerId: 100 },
    ]
) {
    return {
        lineItems: items,
        saleAppointments: links.map((appointment) => ({
            appointment,
        })),
    };
}

test("assigns a directly linked finalized service", () => {
    const result = classifyFinalizedSaleItems(
        makeSale([makeItem(1, 1, 10)]),
        [makeAppointment(1)]
    );

    assert.deepEqual(
        result.assignedItems.map((entry) => entry.item.id),
        [1]
    );
    assert.equal(result.assignedItems[0].appointmentId, 1);
    assert.deepEqual(result.unassignedItems, []);
});

test("keeps items from two appointments separate", () => {
    const result = classifyFinalizedSaleItems(
        makeSale(
            [makeItem(1, 1, 10), makeItem(2, 2, 20)],
            [
                { id: 1, customerId: 100 },
                { id: 2, customerId: 100 },
            ]
        ),
        [
            makeAppointment(1, 10),
            makeAppointment(2, 20),
        ]
    );

    assert.deepEqual(
        result.assignedItems.map((entry) => [
            entry.item.id,
            entry.appointmentId,
        ]),
        [[1, 1], [2, 2]]
    );
});

test("does not guess ownership of a checkout-added service", () => {
    const result = classifyFinalizedSaleItems(
        makeSale(
            [
                makeItem(1, 1, 10),
                makeItem(2, null, 10),
            ],
            [
                { id: 1, customerId: 100 },
                { id: 2, customerId: 100 },
            ]
        ),
        [
            makeAppointment(1, 10),
            makeAppointment(2, 10),
        ]
    );

    assert.deepEqual(
        result.assignedItems.map((entry) => entry.item.id),
        [1]
    );
    assert.deepEqual(
        result.unassignedItems.map((item) => item.id),
        [2]
    );
});

test("assigns checkout-added service in a single-appointment sale", () => {
    const result = classifyFinalizedSaleItems(
        makeSale([makeItem(1, null, 10)]),
        [makeAppointment(1)]
    );

    assert.equal(result.assignedItems.length, 1);
    assert.equal(result.assignedItems[0].appointmentId, 1);
});

test("preserves technician reassignment on linked items", () => {
    const result = classifyFinalizedSaleItems(
        makeSale([makeItem(1, 1, 20)]),
        [makeAppointment(1, 10)]
    );

    assert.equal(result.assignedItems.length, 1);
    assert.equal(result.assignedItems[0].item.employeeId, 20);
});

test("keeps legacy unattributed items unassigned", () => {
    const result = classifyFinalizedSaleItems(
        makeSale([makeItem(1, null, null)]),
        [makeAppointment(1)]
    );

    assert.deepEqual(result.assignedItems, []);
    assert.deepEqual(
        result.unassignedItems.map((item) => item.id),
        [1]
    );
});

test("does not assign items when their appointment is unavailable", () => {
    const result = classifyFinalizedSaleItems(
        makeSale([makeItem(1, 2, 20)], [
            { id: 2, customerId: 100 },
        ]),
        [makeAppointment(1)]
    );

    assert.deepEqual(result.assignedItems, []);
    assert.deepEqual(
        result.unassignedItems.map((item) => item.id),
        [1]
    );
});

test("handles empty finalized sales", () => {
    const result = classifyFinalizedSaleItems(
        makeSale([]),
        [makeAppointment(1)]
    );

    assert.deepEqual(result, {
        assignedItems: [],
        unassignedItems: [],
    });
});

test("does not assign multi-customer checkout-added items", () => {
    const result = classifyFinalizedSaleItems(
        makeSale(
            [makeItem(1, null, 10)],
            [
                { id: 1, customerId: 100 },
                { id: 2, customerId: 200 },
            ]
        ),
        [
            makeAppointment(1, 10, 100),
            makeAppointment(2, 10, 200),
        ]
    );

    assert.deepEqual(result.assignedItems, []);
    assert.deepEqual(
        result.unassignedItems.map((item) => item.id),
        [1]
    );
});

test("classifies every item exactly once", () => {
    const items = [
        makeItem(1, 1, 10),
        makeItem(2, 2, 20),
        makeItem(3, null, 10),
        makeItem(4, null, null),
    ];

    const result = classifyFinalizedSaleItems(
        makeSale(items, [
            { id: 1, customerId: 100 },
            { id: 2, customerId: 100 },
        ]),
        [
            makeAppointment(1, 10),
            makeAppointment(2, 20),
        ]
    );

    const classifiedIds = [
        ...result.assignedItems.map((entry) => entry.item.id),
        ...result.unassignedItems.map((item) => item.id),
    ];

    assert.equal(classifiedIds.length, items.length);
    assert.deepEqual(
        classifiedIds.sort((a, b) => a - b),
        items.map((item) => item.id)
    );
});