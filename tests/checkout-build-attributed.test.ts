
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildAttributedCheckout,
} from "../src/lib/checkout/build-attributed-checkout";

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

test("builds a reconciled multi-technician checkout", () => {
    const result = buildAttributedCheckout(
        services,
        addons,
        15000,
        []
    );

    assert.equal(result.subtotal, 135000);
    assert.equal(result.discountTotal, 15000);
    assert.equal(result.finalTotal, 120000);

    assert.deepEqual(
        result.commissions.map((item) => item.commissionBase),
        [66667, 53333]
    );

    assert.equal(
        result.commissions.reduce(
            (sum, item) => sum + item.commissionBase,
            0
        ),
        result.finalTotal
    );
});

test("preserves technician ownership of add-on revenue", () => {
    const result = buildAttributedCheckout(
        services,
        addons,
        0,
        []
    );

    assert.deepEqual(
        result.commissions.map((item) => item.commissionBase),
        [75000, 60000]
    );
});

test("accepts valid technician tips", () => {
    const result = buildAttributedCheckout(
        services,
        addons,
        0,
        [{ employeeId: 2 }]
    );

    assert.deepEqual(result.eligibleEmployeeIds, [1, 2]);
});

test("rejects tips for unrelated technicians", () => {
    assert.throws(
        () => buildAttributedCheckout(
            services,
            addons,
            0,
            [{ employeeId: 999 }]
        ),
        /INVALID_TIP_EMPLOYEE/
    );
});

test("rejects discounts greater than the subtotal", () => {
    assert.throws(
        () => buildAttributedCheckout(
            services,
            addons,
            135001,
            []
        ),
        /Invalid checkout discount/
    );
});

test("handles a single technician with an added service", () => {
    const result = buildAttributedCheckout(
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

    assert.equal(result.finalTotal, 40000);
    assert.equal(result.commissions.length, 1);
    assert.equal(result.commissions[0].commissionAmount, 20000);
});

test("rejects an invalid add-on parent", () => {
    assert.throws(
        () => buildAttributedCheckout(
            services,
            [{
                addonId: 5,
                serviceIndex: 99,
                price: 15000,
            }],
            0,
            []
        ),
        /CHECKOUT_ADDON_PARENT_INVALID/
    );
});

test("rejects invalid service prices", () => {
    assert.throws(
        () => buildAttributedCheckout(
            [{ ...services[0], price: -1000 }],
            [],
            0,
            []
        ),
        /Invalid checkout commission input/
    );
});