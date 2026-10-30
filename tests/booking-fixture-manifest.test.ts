
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    validateBookingFixtureManifest,
} from "./helpers/booking/fixture-manifest";

const validFixture = {
    marker: "teff-booking-12345678-1234-4234-8234-123456789abc",
    serviceDate: "2099-01-05",
    employeeIds: [10, 20],
    serviceIds: [30, 40],
    addonId: 50,
    blockingCustomerId: 60,
    blockingAppointmentId: 70,
    bookingCustomerIds: [],
    bookingIds: [],
    appointmentIds: [],
};

test("accepts a valid booking fixture manifest", () => {
    assert.deepEqual(
        validateBookingFixtureManifest(validFixture),
        validFixture
    );
});

test("rejects duplicate employee IDs", () => {
    assert.throws(
        () => validateBookingFixtureManifest({
            ...validFixture,
            employeeIds: [10, 10],
        }),
        /Invalid booking fixture manifest/
    );
});

test("rejects unauthorized fixture dates", () => {
    assert.throws(
        () => validateBookingFixtureManifest({
            ...validFixture,
            serviceDate: "2026-10-29",
        }),
        /Invalid booking fixture manifest/
    );
});

test("rejects invalid fixture markers", () => {
    assert.throws(
        () => validateBookingFixtureManifest({
            ...validFixture,
            marker: "production-booking",
        }),
        /Invalid booking fixture manifest/
    );
});

test("rejects duplicate booking IDs", () => {
    assert.throws(
        () => validateBookingFixtureManifest({
            ...validFixture,
            bookingIds: [100, 100],
        }),
        /Invalid booking fixture manifest/
    );
});

test("rejects missing ownership fields", () => {
    const { blockingCustomerId, ...incomplete } = validFixture;

    assert.throws(
        () => validateBookingFixtureManifest(incomplete),
        /Invalid booking fixture manifest/
    );
});