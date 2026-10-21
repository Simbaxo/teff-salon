
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    assertCheckoutVisitUnchanged,
} from "../src/lib/checkout/validate-visit-snapshot";

// A complete appointment snapshot used for checkout calculations.
function makeAppointment() {
    return {
        id: 101,
        employeeId: 1,
        bookingId: 10,
        date: new Date("2099-01-05T00:00:00.000Z"),
        status: "IN_PROGRESS",
        startTime: "10:00",
        duration: 60,
        appointmentServices: [
            { serviceId: 5, bookedPrice: 60000 },
        ],
        appointmentAddons: [
            { addonId: 3, bookedPrice: 10000 },
        ],
    };
}

test("accepts an unchanged checkout visit", () => {
    const original = [makeAppointment()];
    const current = [makeAppointment()];

    assert.doesNotThrow(() =>
        assertCheckoutVisitUnchanged(original, current)
    );
});

test("rejects technician reassignment during checkout", () => {
    const original = [makeAppointment()];
    const current = [{ ...makeAppointment(), employeeId: 2 }];

    assert.throws(
        () => assertCheckoutVisitUnchanged(original, current),
        /CHECKOUT_VISIT_CHANGED/
    );
});

test("rejects appointment status changes", () => {
    const current = [{ ...makeAppointment(), status: "COMPLETED" }];

    assert.throws(
        () => assertCheckoutVisitUnchanged([makeAppointment()], current),
        /CHECKOUT_VISIT_CHANGED/
    );
});

test("rejects appointment date changes", () => {
    const current = [{
        ...makeAppointment(),
        date: new Date("2099-01-06T00:00:00.000Z"),
    }];

    assert.throws(
        () => assertCheckoutVisitUnchanged([makeAppointment()], current),
        /CHECKOUT_VISIT_CHANGED/
    );
});

test("rejects service price changes", () => {
    const current = [{
        ...makeAppointment(),
        appointmentServices: [
            { serviceId: 5, bookedPrice: 80000 },
        ],
    }];

    assert.throws(
        () => assertCheckoutVisitUnchanged([makeAppointment()], current),
        /CHECKOUT_VISIT_CHANGED/
    );
});

test("rejects add-on changes", () => {
    const current = [{
        ...makeAppointment(),
        appointmentAddons: [],
    }];

    assert.throws(
        () => assertCheckoutVisitUnchanged([makeAppointment()], current),
        /CHECKOUT_VISIT_CHANGED/
    );
});

test("rejects missing appointment blocks", () => {
    assert.throws(
        () => assertCheckoutVisitUnchanged([makeAppointment()], []),
        /CHECKOUT_VISIT_CHANGED/
    );
});

test("accepts reordered service selections", () => {
    const original = [{
        ...makeAppointment(),
        appointmentServices: [
            { serviceId: 5, bookedPrice: 60000 },
            { serviceId: 6, bookedPrice: 40000 },
        ],
    }];

    const current = [{
        ...makeAppointment(),
        appointmentServices: [
            { serviceId: 6, bookedPrice: 40000 },
            { serviceId: 5, bookedPrice: 60000 },
        ],
    }];

    assert.doesNotThrow(() =>
        assertCheckoutVisitUnchanged(original, current)
    );
});