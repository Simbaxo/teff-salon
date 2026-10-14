
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    validateManualPayment,
} from "../src/lib/payroll/manual-payment-validation";

const validPayment = {
    payrollEntryId: 1,
    amount: 50000,
    paymentDate: "2026-09-21",
    paymentMethod: "TRANSFER",
    description: "Transferencia realizada",
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    paymentReference: "TEFF-MANUAL-001",
    confirmedDelivered: true,
    confirmedNotPreviouslyRecorded: true,
};

test("accepts a valid manual payment", () => {
    const result = validateManualPayment(validPayment);

    assert.equal(result.success, true);

    if (result.success) {
        assert.equal(result.data.amount, 50000);
        assert.equal(result.data.confirmedDelivered, true);
    }
});

test("rejects payment without delivery confirmation", () => {
    const result = validateManualPayment({
        ...validPayment,
        confirmedDelivered: false,
    });

    assert.equal(result.success, false);
});

test("rejects payment already accounted for", () => {
    const result = validateManualPayment({
        ...validPayment,
        confirmedNotPreviouslyRecorded: false,
    });

    assert.equal(result.success, false);
});

test("rejects zero or negative amounts", () => {
    for (const amount of [0, -10000]) {
        const result = validateManualPayment({
            ...validPayment,
            amount,
        });

        assert.equal(result.success, false);
    }
});

test("rejects invalid idempotency keys", () => {
    const result = validateManualPayment({
        ...validPayment,
        idempotencyKey: "invalid",
    });

    assert.equal(result.success, false);
});

test("accepts payments without a receipt reference", () => {
    const result = validateManualPayment({
        ...validPayment,
        paymentReference: null,
    });

    assert.equal(result.success, true);
});