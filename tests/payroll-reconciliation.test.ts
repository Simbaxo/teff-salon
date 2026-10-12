
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    calculatePayrollReconciliation,
} from "../src/lib/payroll/reconciliation";

// No previous payments: the entire net payroll is outstanding.
test("calculates payroll with no previous payments", () => {
    const result = calculatePayrollReconciliation({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [],
    });

    assert.equal(result.remainingBalance, 400000);
    assert.equal(result.isFullySettled, false);
    assert.equal(result.hasOverpayment, false);
});

// A partial historical payment reduces the outstanding balance.
test("calculates a partial historical payment", () => {
    const result = calculatePayrollReconciliation({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [
            { amount: 250000 },
        ],
    });

    assert.equal(result.historicalPaymentsTotal, 250000);
    assert.equal(result.remainingBalance, 150000);
});

// Multiple historical payments are combined.
test("combines multiple historical payments", () => {
    const result = calculatePayrollReconciliation({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [
            { amount: 150000 },
            { amount: 100000 },
        ],
    });

    assert.equal(result.historicalPaymentsTotal, 250000);
    assert.equal(result.remainingBalance, 150000);
});

// A fully settled historical payroll has no remaining balance.
test("identifies fully settled payroll", () => {
    const result = calculatePayrollReconciliation({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [
            { amount: 400000 },
        ],
    });

    assert.equal(result.remainingBalance, 0);
    assert.equal(result.isFullySettled, true);
});

// Already-paid commissions are excluded from the amount still owed.
test("accounts for previously paid commissions", () => {
    const result = calculatePayrollReconciliation({
        netPay: 400000,
        paidCommissions: 100000,
        historicalPayments: [
            { amount: 250000 },
        ],
    });

    assert.equal(result.previouslyPaidTotal, 350000);
    assert.equal(result.remainingBalance, 50000);
});

// Overpayments must be flagged, not silently accepted.
test("detects historical overpayments", () => {
    const result = calculatePayrollReconciliation({
        netPay: 400000,
        paidCommissions: 0,
        historicalPayments: [
            { amount: 450000 },
        ],
    });

    assert.equal(result.remainingBalance, -50000);
    assert.equal(result.hasOverpayment, true);
});

// Zero earnings with no payments is a settled zero balance.
test("handles zero payroll", () => {
    const result = calculatePayrollReconciliation({
        netPay: 0,
        paidCommissions: 0,
        historicalPayments: [],
    });

    assert.equal(result.remainingBalance, 0);
    assert.equal(result.isFullySettled, true);
});
