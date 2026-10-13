
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    validateHistoricalPayment,
} from "../src/lib/payroll/historical-payment-validation";

// Example only. No actual payment will be recorded.
const validPayment = {
    payrollEntryId: 1,
    amount: 50000,
    paymentDate: "2026-09-21",
    paymentMethod: "TRANSFER",
    description: "Pago anterior verificado",
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    paymentReference: "TEFF-TEST-001",
    confirmedDelivered: true,
    confirmedNotPreviouslyRecorded: true,
};

test("accepts a valid historical payment", () => {
    const result = validateHistoricalPayment(validPayment);

    assert.equal(result.success, true);

    if (result.success) {
        assert.equal(result.data.amount, 50000);
        assert.equal(result.data.confirmedDelivered, true);
        assert.equal(
            result.data.paymentReference,
            "TEFF-TEST-001"
        );
    }
});

test("rejects missing delivery confirmation", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        confirmedDelivered: false,
    });

    assert.equal(result.success, false);
});

test("rejects an invalid idempotency key", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        idempotencyKey: "invalid-key",
    });

    assert.equal(result.success, false);
});

test("rejects zero or negative amounts", () => {
    for (const amount of [0, -10000]) {
        const result = validateHistoricalPayment({
            ...validPayment,
            amount,
        });

        assert.equal(result.success, false);
    }
});

test("rejects invalid payment dates", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        paymentDate: "2026-02-30",
    });

    assert.equal(result.success, false);
});

test("rejects unsupported payment methods", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        paymentMethod: "CRYPTO",
    });

    assert.equal(result.success, false);
});

test("rejects payment references over 120 characters", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        paymentReference: "A".repeat(121),
    });

    assert.equal(result.success, false);
});

test("accepts a payment without a receipt reference", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        paymentReference: null,
    });

    assert.equal(result.success, true);

    if (result.success) {
        assert.equal(result.data.paymentReference, null);
    }
});

test("rejects payment amounts exceeding PostgreSQL Int", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        amount: 2_147_483_648,
    });

    assert.equal(result.success, false);
});

test("rejects missing accounting confirmation", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        confirmedNotPreviouslyRecorded: undefined,
    });

    assert.equal(result.success, false);
});

test("rejects payment already accounted for", () => {
    const result = validateHistoricalPayment({
        ...validPayment,
        confirmedNotPreviouslyRecorded: false,
    });

    assert.equal(result.success, false);

    if (!result.success) {
        assert.match(
            result.error,
            /registrado previamente/
        );
    }
});
