
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    calculateManualPaymentBalance,
} from "../src/lib/payroll/manual-payments";

test("calculates payroll without manual payments", () => {
    const result = calculateManualPaymentBalance({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [],
        manualPayments: [],
    });

    assert.equal(result.remainingBalance, 400000);
    assert.equal(result.isFullyPaid, false);
});

test("calculates partial manual payments", () => {
    const result = calculateManualPaymentBalance({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [],
        manualPayments: [
            { amount: 150000 },
            { amount: 100000 },
        ],
    });

    assert.equal(result.manualPaymentsTotal, 250000);
    assert.equal(result.remainingBalance, 150000);
});

test("identifies fully paid payroll", () => {
    const result = calculateManualPaymentBalance({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [],
        manualPayments: [{ amount: 400000 }],
    });

    assert.equal(result.remainingBalance, 0);
    assert.equal(result.isFullyPaid, true);
});

test("includes historical payments", () => {
    const result = calculateManualPaymentBalance({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [{ amount: 100000 }],
        manualPayments: [{ amount: 150000 }],
    });

    assert.equal(result.remainingBalance, 150000);
});

test("accounts for commissions already paid", () => {
    const result = calculateManualPaymentBalance({
        netPay: 400000,
        paidCommissions: 100000,
        historicalPayments: [],
        manualPayments: [{ amount: 200000 }],
    });

    assert.equal(result.remainingBalance, 100000);
});

test("detects overpayments", () => {
    const result = calculateManualPaymentBalance({
        netPay: 100000,
        paidCommissions: 0,
        historicalPayments: [],
        manualPayments: [{ amount: 120000 }],
    });

    assert.equal(result.hasOverpayment, true);
    assert.equal(result.remainingBalance, -20000);
});

test("does not subtract delivered tips twice", () => {
    // netPay already excludes tips marked PAID.
    const result = calculateManualPaymentBalance({
        netPay: 120000,
        paidCommissions: 0,
        historicalPayments: [],
        manualPayments: [{ amount: 100000 }],
    });

    assert.equal(result.remainingBalance, 20000);
});