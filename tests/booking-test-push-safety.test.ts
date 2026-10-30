
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    shouldSuppressBookingPush,
} from "../src/lib/booking/test-push-safety";

const developmentUrl =
    "postgresql://user:password@ep-ancient-cherry-ax0y0y4q-pooler.c-4.us-east-2.aws.neon.tech/neondb";

const productionUrl =
    "postgresql://user:password@ep-misty-bird-ax2o1u0v-pooler.c-4.us-east-2.aws.neon.tech/neondb";

// Dummy credentials only. These tests never connect to a database.

test("normal production bookings keep notifications enabled", () => {
    assert.equal(
        shouldSuppressBookingPush({
            NODE_ENV: "production",
            DATABASE_URL: productionUrl,
        }),
        false
    );
});

test("normal development bookings keep notifications enabled", () => {
    assert.equal(
        shouldSuppressBookingPush({
            NODE_ENV: "development",
            DATABASE_URL: developmentUrl,
        }),
        false
    );
});

test("approved booking tests suppress notifications", () => {
    assert.equal(
        shouldSuppressBookingPush({
            NODE_ENV: "development",
            DATABASE_URL: developmentUrl,
            TEFF_BOOKING_TEST_DISABLE_PUSH: "true",
        }),
        true
    );
});

test("rejects notification suppression in production", () => {
    assert.throws(
        () =>
            shouldSuppressBookingPush({
                NODE_ENV: "production",
                DATABASE_URL: productionUrl,
                TEFF_BOOKING_TEST_DISABLE_PUSH: "true",
            }),
        /Unsafe booking notification test environment/
    );
});

test("rejects unauthorized database endpoints", () => {
    assert.throws(
        () =>
            shouldSuppressBookingPush({
                NODE_ENV: "development",
                DATABASE_URL:
                    "postgresql://user:password@other.example.com/neondb",
                TEFF_BOOKING_TEST_DISABLE_PUSH: "true",
            }),
        /Booking notification suppression requires Neon Development/
    );
});

test("rejects missing database configuration", () => {
    assert.throws(
        () =>
            shouldSuppressBookingPush({
                NODE_ENV: "development",
                TEFF_BOOKING_TEST_DISABLE_PUSH: "true",
            }),
        /Missing booking test database configuration/
    );
});

test("rejects invalid database URLs", () => {
    assert.throws(
        () =>
            shouldSuppressBookingPush({
                NODE_ENV: "development",
                DATABASE_URL: "invalid-url",
                TEFF_BOOKING_TEST_DISABLE_PUSH: "true",
            }),
        /Invalid booking test database configuration/
    );
});

test("does not suppress notifications for an inactive test flag", () => {
    assert.equal(
        shouldSuppressBookingPush({
            NODE_ENV: "development",
            DATABASE_URL: developmentUrl,
            TEFF_BOOKING_TEST_DISABLE_PUSH: "false",
        }),
        false
    );
});