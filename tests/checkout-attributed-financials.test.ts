
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    prepareAttributedFinancials,
} from "../src/lib/checkout/prepare-attributed-financials";

const services = [
    {
        serviceId: 10,
        appointmentId: 101,
        employeeId: 1,
        price: 60000,
    },
    {
        serviceId: 20,
        appointmentId: 102,
        employeeId: 2,
        price: 60000,
    },
];

const addons = [
    {
        addonId: 5,
        serviceIndex: 0,
        price: 15000,
    },
];

test("attributes revenue to two technicians", () => {
    const result = prepareAttributedFinancials(
        services,
        [],
        0,
        []
    );

    assert.equal(result.subtotal, 120000);
    assert.equal(result.commissions.length, 2);

    assert.deepEqual(
        result.commissions.map((item) => item.commissionAmount),
        [30000, 30000]
    );
});

test("attributes add-on revenue to its parent technician", () => {
    const result = prepareAttributedFinancials(
        services,
        addons,
        0,
        []
    );

    assert.equal(result.subtotal, 135000);

    assert.deepEqual(
        result.commissions.map((item) => item.commissionBase),
        [75000, 60000]
    );
});

test("distributes discounts and reconciles totals", () => {
    const result = prepareAttributedFinancials(
        services,
        addons,
        15000,
        []
    );

    assert.equal(result.subtotal, 135000);

    const totalBase = result.commissions.reduce(
        (sum, item) => sum + item.commissionBase,
        0
    );

    assert.equal(totalBase, 120000);
    assert.deepEqual(
        result.commissions.map((item) => item.commissionBase),
        [66667, 53333]
    );
});

test("allows tips for technicians who performed services", () => {
    const result = prepareAttributedFinancials(
        services,
        addons,
        0,
        [{ employeeId: 2 }]
    );

    assert.deepEqual(
        result.eligibleEmployeeIds,
        [1, 2]
    );
});

test("rejects tips for unrelated technicians", () => {
    assert.throws(
        () => prepareAttributedFinancials(
            services,
            addons,
            0,
            [{ employeeId: 999 }]
        ),
        /INVALID_TIP_EMPLOYEE/
    );
});

test("rejects an invalid add-on parent", () => {
    assert.throws(
        () => prepareAttributedFinancials(
            services,
            [{ addonId: 5, serviceIndex: 99, price: 15000 }],
            0,
            []
        ),
        /CHECKOUT_ADDON_PARENT_INVALID/
    );
});

test("rejects discounts greater than the subtotal", () => {
    assert.throws(
        () => prepareAttributedFinancials(
            services,
            [],
            120001,
            []
        ),
        /Invalid checkout discount/
    );
});

test("handles newly added services", () => {
    const result = prepareAttributedFinancials(
        [{
            serviceId: 30,
            appointmentId: null,
            employeeId: 2,
            price: 40000,
        }],
        [],
        0,
        []
    );

    assert.equal(result.subtotal, 40000);
    assert.equal(result.commissions[0].employeeId, 2);
    assert.equal(result.commissions[0].commissionAmount, 20000);
});

test("rejects invalid negative prices", () => {
    assert.throws(
        () => prepareAttributedFinancials(
            [{ ...services[0], price: -1000 }],
            [],
            0,
            []
        ),
        /Invalid checkout commission input/
    );
});