
import assert from "node:assert/strict";
import { test } from "node:test";

import { validateCheckoutAssignmentTotals } from
    "../src/lib/checkout/validate-assignment-totals";

import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "../src/lib/checkout/types";

// Two services assigned to different technicians.
const services: CheckoutServiceAssignment[] = [
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

const addons: CheckoutAddonAssignment[] = [
    {
        addonId: 5,
        serviceIndex: 0,
        price: 15000,
    },
];

const servicePrices = [
    { serviceId: 10, price: 60000 },
    { serviceId: 20, price: 60000 },
];

const addonPrices = [
    { addonId: 5, price: 15000 },
];

// Reuse the same valid checkout for each test.
function validate(
    selectedServices = services,
    selectedAddons = addons,
    serviceIds = [10, 20],
    addonIds = [5],
    prices = servicePrices,
    additionalPrices = addonPrices
) {
    validateCheckoutAssignmentTotals(
        selectedServices,
        selectedAddons,
        serviceIds,
        addonIds,
        prices,
        additionalPrices
    );
}

test("accepts matching checkout assignments", () => {
    assert.doesNotThrow(() => validate());
});

test("accepts different selection ordering", () => {
    assert.doesNotThrow(() =>
        validate(services, addons, [20, 10])
    );
});

test("rejects missing service assignments", () => {
    assert.throws(
        () => validate([services[0]]),
        /Checkout assignments do not match selected items/
    );
});

test("rejects unexpected service assignments", () => {
    assert.throws(
        () => validate(services, addons, [10]),
        /Checkout assignments do not match selected items/
    );
});

test("rejects incorrect service prices", () => {
    assert.throws(
        () => validate(
            services,
            addons,
            [10, 20],
            [5],
            [
                { serviceId: 10, price: 70000 },
                { serviceId: 20, price: 60000 },
            ]
        ),
        /Checkout assignment prices do not match/
    );
});

test("rejects incorrect add-on prices", () => {
    assert.throws(
        () => validate(
            services,
            addons,
            [10, 20],
            [5],
            servicePrices,
            [{ addonId: 5, price: 20000 }]
        ),
        /Checkout assignment prices do not match/
    );
});

test("rejects duplicate service IDs", () => {
    assert.throws(
        () => validate(
            [services[0], { ...services[0] }],
            addons
        ),
        /Duplicate checkout item ID/
    );
});

test("rejects duplicate add-on IDs", () => {
    assert.throws(
        () => validate(
            services,
            [addons[0], { ...addons[0] }]
        ),
        /Duplicate checkout item ID/
    );
});

test("rejects missing add-on assignments", () => {
    assert.throws(
        () => validate(services, []),
        /Checkout assignments do not match selected items/
    );
});