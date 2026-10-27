
import assert from "node:assert/strict";
import { test } from "node:test";

import { getBookingConfirmationStatus } from "../src/lib/booking/confirmation-status";

test("confirms when all appointments are BOOKED", () => {
    const result = getBookingConfirmationStatus(
        [{ status: "BOOKED" }, { status: "BOOKED" }],
        2
    );

    assert.equal(result, "CONFIRMED");
});

test("identifies appointments awaiting approval", () => {
    const result = getBookingConfirmationStatus(
        [{ status: "REQUESTED" }, { status: "REQUESTED" }],
        2
    );

    assert.equal(result, "REQUESTED");
});

test("identifies mixed confirmation statuses", () => {
    const result = getBookingConfirmationStatus(
        [{ status: "BOOKED" }, { status: "REQUESTED" }],
        2
    );

    assert.equal(result, "MIXED");
});

test("rejects empty appointment responses", () => {
    const result = getBookingConfirmationStatus([], 2);

    assert.equal(result, "UNVERIFIED");
});

test("rejects incomplete appointment responses", () => {
    const result = getBookingConfirmationStatus(
        [{ status: "BOOKED" }],
        2
    );

    assert.equal(result, "UNVERIFIED");
});

test("rejects unexpected appointment statuses", () => {
    const result = getBookingConfirmationStatus(
        [{ status: "BOOKED" }, { status: "CANCELLED" }],
        2
    );

    assert.equal(result, "UNVERIFIED");
});

test("rejects missing appointment statuses", () => {
    const result = getBookingConfirmationStatus(
        [{ status: "BOOKED" }, {}],
        2
    );

    assert.equal(result, "UNVERIFIED");
});

test("rejects zero expected services", () => {
    const result = getBookingConfirmationStatus([], 0);

    assert.equal(result, "UNVERIFIED");
});