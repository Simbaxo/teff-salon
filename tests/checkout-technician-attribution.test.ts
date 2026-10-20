
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    calculateCheckoutCommissions,
} from "../src/lib/checkout/technician-attribution";

test("attributes one service to its technician", () => {
    const result = calculateCheckoutCommissions(
        [{ employeeId: 1, price: 60000 }],
        0
    );

    assert.deepEqual(result, [
        {
            employeeId: 1,
            commissionBase: 60000,
            commissionRate: 50,
            commissionAmount: 30000,
        },
    ]);
});

test("attributes services to different technicians", () => {
    const result = calculateCheckoutCommissions(
        [
            { employeeId: 1, price: 60000 },
            { employeeId: 2, price: 60000 },
        ],
        0
    );

    assert.deepEqual(result, [
        {
            employeeId: 1,
            commissionBase: 60000,
            commissionRate: 50,
            commissionAmount: 30000,
        },
        {
            employeeId: 2,
            commissionBase: 60000,
            commissionRate: 50,
            commissionAmount: 30000,
        },
    ]);
});

test("allocates discounts proportionally", () => {
    const result = calculateCheckoutCommissions(
        [
            { employeeId: 1, price: 60000 },
            { employeeId: 2, price: 60000 },
        ],
        20000
    );

    assert.deepEqual(
        result.map((item) => item.commissionBase),
        [50000, 50000]
    );
});

test("combines multiple services from one technician", () => {
    const result = calculateCheckoutCommissions(
        [
            { employeeId: 1, price: 60000 },
            { employeeId: 1, price: 40000 },
        ],
        0
    );

    assert.equal(result.length, 1);
    assert.equal(result[0].commissionBase, 100000);
    assert.equal(result[0].commissionAmount, 50000);
});

test("handles a zero-price service", () => {
    const result = calculateCheckoutCommissions(
        [{ employeeId: 1, price: 0 }],
        0
    );

    assert.equal(result[0].commissionBase, 0);
    assert.equal(result[0].commissionAmount, 0);
});


test("reconciles an uneven discount exactly", () => {
    const result = calculateCheckoutCommissions(
        [
            { employeeId: 1, price: 33333 },
            { employeeId: 2, price: 33333 },
            { employeeId: 3, price: 33334 },
        ],
        10001
    );

    const totalBase = result.reduce(
        (total, item) => total + item.commissionBase,
        0
    );

    assert.equal(totalBase, 89999);
    assert.ok(result.every((item) => item.commissionBase >= 0));
});

test("rejects discounts exceeding the subtotal", () => {
    assert.throws(
        () =>
            calculateCheckoutCommissions(
                [{ employeeId: 1, price: 60000 }],
                60001
            ),
        /Invalid checkout discount/
    );
});

test("rejects invalid technician IDs", () => {
    assert.throws(
        () =>
            calculateCheckoutCommissions(
                [{ employeeId: 0, price: 60000 }],
                0
            ),
        /Invalid checkout commission input/
    );
});

test("rejects negative service prices", () => {
    assert.throws(
        () =>
            calculateCheckoutCommissions(
                [{ employeeId: 1, price: -1000 }],
                0
            ),
        /Invalid checkout commission input/
    );
});

test("handles a fully discounted sale", () => {
    const result = calculateCheckoutCommissions(
        [
            { employeeId: 1, price: 60000 },
            { employeeId: 2, price: 40000 },
        ],
        100000
    );

    assert.equal(
        result.reduce(
            (total, item) => total + item.commissionBase,
            0
        ),
        0
    );

    assert.ok(
        result.every((item) => item.commissionAmount === 0)
    );
});


test("reconciles small amounts without negative commission bases", () => {
    const result = calculateCheckoutCommissions(
        [
            { employeeId: 1, price: 1 },
            { employeeId: 2, price: 1 },
            { employeeId: 3, price: 1 },
        ],
        2
    );

    const totalBase = result.reduce(
        (total, item) => total + item.commissionBase,
        0
    );

    assert.equal(totalBase, 1);
    assert.ok(
        result.every((item) => item.commissionBase >= 0)
    );
});


test("attributes add-on revenue to the parent service technician", () => {
    // The checkout API must validate the add-on's parent service.
    const result = calculateCheckoutCommissions(
        [
            { employeeId: 1, price: 60000 },
            { employeeId: 1, price: 15000 },
            { employeeId: 2, price: 60000 },
        ],
        0
    );

    assert.deepEqual(
        result.map((item) => ({
            employeeId: item.employeeId,
            commissionBase: item.commissionBase,
            commissionAmount: item.commissionAmount,
        })),
        [
            {
                employeeId: 1,
                commissionBase: 75000,
                commissionAmount: 37500,
            },
            {
                employeeId: 2,
                commissionBase: 60000,
                commissionAmount: 30000,
            },
        ]
    );
});