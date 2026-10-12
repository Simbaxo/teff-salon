
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    calculatePayrollDraftSummary,
} from "../src/lib/payroll/draft-summary";

// A standard commission with no previous payments.
test("calculates a draft with no historical payments", () => {
    const result = calculatePayrollDraftSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [{
            employeeId: 1,
            commissionBase: 200000,
            commissionAmount: 100000,
            status: "PENDING",
            payrollEntryId: null,
        }],
        tips: [],
        adjustments: [],
        historicalPayments: [],
    });

    assert.equal(result.productionTotal, 200000);
    assert.equal(result.totalEarned, 100000);
    assert.equal(result.netPay, 100000);
    assert.equal(result.remainingBalance, 100000);
    assert.equal(result.requiresReconciliation, false);
});

// Previous partial payments reduce the remaining balance.
test("calculates partial historical payments", () => {
    const result = calculatePayrollDraftSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [{
            employeeId: 1,
            commissionBase: 800000,
            commissionAmount: 400000,
            status: "PENDING",
            payrollEntryId: null,
        }],
        tips: [],
        adjustments: [],
        historicalPayments: [
            { amount: 150000 },
            { amount: 100000 },
        ],
    });

    assert.equal(result.netPay, 400000);
    assert.equal(result.historicalPaymentsTotal, 250000);
    assert.equal(result.remainingBalance, 150000);
});

// Cash tips already delivered must not be paid again.
test("does not double-count delivered cash tips", () => {
    const result = calculatePayrollDraftSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [],
        tips: [{
            employeeId: 1,
            amount: 20000,
            status: "PAID",
            payrollEntryId: null,
        }],
        adjustments: [],
        historicalPayments: [],
    });

    assert.equal(result.tipsTotal, 20000);
    assert.equal(result.tipsAlreadyPaid, 20000);
    assert.equal(result.netPay, 0);
    assert.equal(result.remainingBalance, 0);
});

// Previously paid commissions are excluded from outstanding payroll.
test("accounts for commissions already paid", () => {
    const result = calculatePayrollDraftSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [{
            employeeId: 1,
            commissionBase: 200000,
            commissionAmount: 100000,
            status: "PAID",
            payrollEntryId: null,
        }],
        tips: [],
        adjustments: [],
        historicalPayments: [],
    });

    assert.equal(result.netPay, 100000);
    assert.equal(result.paidCommissions, 100000);
    assert.equal(result.remainingBalance, 0);
    assert.equal(result.isFullySettled, true);
});

// Flag historical payments exceeding net payroll.
test("detects historical overpayments", () => {
    const result = calculatePayrollDraftSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [{
            employeeId: 1,
            commissionBase: 100000,
            commissionAmount: 50000,
            status: "PENDING",
            payrollEntryId: null,
        }],
        tips: [],
        adjustments: [],
        historicalPayments: [{ amount: 70000 }],
    });

    assert.equal(result.remainingBalance, -20000);
    assert.equal(result.hasOverpayment, true);
    assert.equal(result.requiresReconciliation, true);
});

// A financial record assigned elsewhere must be flagged.
test("detects conflicting payroll assignments", () => {
    const result = calculatePayrollDraftSummary({
        employeeId: 1,
        payrollEntryId: 10,
        commissions: [{
            employeeId: 1,
            commissionBase: 100000,
            commissionAmount: 50000,
            status: "PENDING",
            payrollEntryId: 20,
        }],
        tips: [],
        adjustments: [],
        historicalPayments: [],
    });

    assert.equal(result.conflictingCommissions, 1);
    assert.equal(result.requiresReconciliation, true);
});

// A fully reconciled historical payment has zero remaining balance.
test("identifies a fully reconciled historical draft", () => {
    const result = calculatePayrollDraftSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [{
            employeeId: 1,
            commissionBase: 200000,
            commissionAmount: 100000,
            status: "PENDING",
            payrollEntryId: null,
        }],
        tips: [],
        adjustments: [],
        historicalPayments: [{ amount: 100000 }],
    });

    assert.equal(result.remainingBalance, 0);
    assert.equal(result.isFullySettled, true);
});