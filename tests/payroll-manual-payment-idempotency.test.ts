
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    isSameManualPayment,
    type ManualPaymentIdentity,
} from "../src/lib/payroll/manual-payment-idempotency";

const original: ManualPaymentIdentity = {
    payrollEntryId: 1,
    amount: 50000,
    paymentDate: "2026-09-21",
    paymentMethod: "TRANSFER",
    paymentReference: "TEFF-001",
    description: "Pago realizado",
    recordedByUserId: 1,
};

test("accepts an identical payment retry", () => {
    assert.equal(isSameManualPayment(original, { ...original }), true);
});

test("rejects a changed payment amount", () => {
    assert.equal(
        isSameManualPayment(original, { ...original, amount: 60000 }),
        false
    );
});

test("rejects a different payroll entry", () => {
    assert.equal(
        isSameManualPayment(original, { ...original, payrollEntryId: 2 }),
        false
    );
});

test("rejects a different payment reference", () => {
    assert.equal(
        isSameManualPayment(original, {
            ...original,
            paymentReference: "TEFF-002",
        }),
        false
    );
});

test("rejects a different recording Owner", () => {
    assert.equal(
        isSameManualPayment(original, {
            ...original,
            recordedByUserId: 2,
        }),
        false
    );
});

test("rejects a different payment date or method", () => {
    assert.equal(
        isSameManualPayment(original, {
            ...original,
            paymentDate: "2026-09-22",
        }),
        false
    );

    assert.equal(
        isSameManualPayment(original, {
            ...original,
            paymentMethod: "CASH",
        }),
        false
    );
});