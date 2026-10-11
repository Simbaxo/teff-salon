
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    calculateWeeklyPayrollSummary,
} from "../src/lib/payroll/weekly-summary";

const commission = {
    employeeId: 1,
    commissionBase: 100000,
    commissionAmount: 50000,
    status: "PENDING",
    payrollEntryId: null,
};

const tip = {
    employeeId: 1,
    amount: 20000,
    status: "PAID",
    payrollEntryId: null,
};

test("calculates weekly earnings and cash tips", () => {
    const result = calculateWeeklyPayrollSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [commission],
        tips: [tip],
        adjustments: [],
    });

    assert.equal(result.productionTotal, 100000);
    assert.equal(result.commissionTotal, 50000);
    assert.equal(result.tipsTotal, 20000);
    assert.equal(result.totalEarned, 70000);
    assert.equal(result.tipsAlreadyPaid, 20000);
    assert.equal(result.outstandingPay, 50000);
    assert.equal(result.requiresReview, false);
});

test("accepts records assigned to the current payroll entry", () => {
    const result = calculateWeeklyPayrollSummary({
        employeeId: 1,
        payrollEntryId: 10,
        commissions: [
            { ...commission, payrollEntryId: 10 },
        ],
        tips: [
            { ...tip, payrollEntryId: 10 },
        ],
        adjustments: [],
    });

    assert.equal(result.conflictingCommissions, 0);
    assert.equal(result.conflictingTips, 0);
    assert.equal(result.requiresReview, false);
});

test("detects commissions assigned to another payroll entry", () => {
    const result = calculateWeeklyPayrollSummary({
        employeeId: 1,
        payrollEntryId: 10,
        commissions: [
            { ...commission, payrollEntryId: 20 },
        ],
        tips: [],
        adjustments: [],
    });

    assert.equal(result.conflictingCommissions, 1);
    assert.equal(result.requiresReview, true);
});

test("detects tips assigned to another payroll entry", () => {
    const result = calculateWeeklyPayrollSummary({
        employeeId: 1,
        payrollEntryId: 10,
        commissions: [],
        tips: [
            { ...tip, payrollEntryId: 20 },
        ],
        adjustments: [],
    });

    assert.equal(result.conflictingTips, 1);
    assert.equal(result.requiresReview, true);
});

test("excludes previously paid commissions from outstanding pay", () => {
    const result = calculateWeeklyPayrollSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [
            { ...commission, status: "PAID" },
        ],
        tips: [],
        adjustments: [],
    });

    assert.equal(result.totalEarned, 50000);
    assert.equal(result.paidCommissions, 50000);
    assert.equal(result.outstandingPay, 0);
});

test("flags negative outstanding payroll", () => {
    const result = calculateWeeklyPayrollSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [commission],
        tips: [],
        adjustments: [
            { type: "LOAN", amount: 80000 },
        ],
    });

    assert.equal(result.netPay, -30000);
    assert.equal(result.requiresReview, true);
});

test("ignores financial records belonging to another technician", () => {
    const result = calculateWeeklyPayrollSummary({
        employeeId: 1,
        payrollEntryId: null,
        commissions: [
            commission,
            { ...commission, employeeId: 2 },
        ],
        tips: [
            tip,
            { ...tip, employeeId: 2 },
        ],
        adjustments: [],
    });

    assert.equal(result.productionTotal, 100000);
    assert.equal(result.commissionTotal, 50000);
    assert.equal(result.tipsTotal, 20000);
});
