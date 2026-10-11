
import assert from "node:assert/strict";
import { test } from "node:test";

import { calculatePayroll } from "../src/lib/payroll/calculations";

// Standard weekly payroll with electronic tips.
test("calculates standard weekly payroll", () => {
    const result = calculatePayroll({
        commissions: [
            {
                commissionBase: 900000,
                commissionAmount: 450000,
            },
        ],
        tips: [
            { amount: 60000, status: "PENDING" },
        ],
        adjustments: [
            { type: "BONUS", amount: 100000 },
            { type: "LOAN", amount: 50000 },
            { type: "UNIFORM", amount: 25000 },
        ],
    });

    assert.equal(result.productionTotal, 900000);
    assert.equal(result.commissionTotal, 450000);
    assert.equal(result.tipsTotal, 60000);
    assert.equal(result.totalEarned, 610000);
    assert.equal(result.netPay, 535000);
});

// Cash tips count as earned but are not paid again.
test("subtracts tips already delivered", () => {
    const result = calculatePayroll({
        commissions: [
            {
                commissionBase: 200000,
                commissionAmount: 100000,
            },
        ],
        tips: [
            { amount: 20000, status: "PAID" },
            { amount: 30000, status: "PENDING" },
        ],
        adjustments: [],
    });

    assert.equal(result.tipsTotal, 50000);
    assert.equal(result.tipsAlreadyPaid, 20000);
    assert.equal(result.totalEarned, 150000);
    assert.equal(result.netPay, 130000);
});

// Multiple transactions should be combined correctly.
test("combines multiple commissions", () => {
    const result = calculatePayroll({
        commissions: [
            {
                commissionBase: 100000,
                commissionAmount: 50000,
            },
            {
                commissionBase: 80000,
                commissionAmount: 40000,
            },
        ],
        tips: [],
        adjustments: [],
    });

    assert.equal(result.productionTotal, 180000);
    assert.equal(result.commissionTotal, 90000);
    assert.equal(result.netPay, 90000);
});

// No activity produces zero payroll.
test("handles zero earnings", () => {
    const result = calculatePayroll({
        commissions: [],
        tips: [],
        adjustments: [],
    });

    assert.equal(result.productionTotal, 0);
    assert.equal(result.totalEarned, 0);
    assert.equal(result.netPay, 0);
});

// Deductions can exceed earnings; payment must be reviewed.
test("identifies a negative net payout", () => {
    const result = calculatePayroll({
        commissions: [
            {
                commissionBase: 100000,
                commissionAmount: 50000,
            },
        ],
        tips: [],
        adjustments: [
            { type: "LOAN", amount: 80000 },
        ],
    });

    assert.equal(result.totalEarned, 50000);
    assert.equal(result.netPay, -30000);
    assert.ok(result.netPay < 0);
});

// Other deductions must reduce net pay.
test("applies other deductions", () => {
    const result = calculatePayroll({
        commissions: [
            {
                commissionBase: 120000,
                commissionAmount: 60000,
            },
        ],
        tips: [],
        adjustments: [
            {
                type: "OTHER_DEDUCTION",
                amount: 10000,
            },
        ],
    });

    assert.equal(result.otherDeductions, 10000);
    assert.equal(result.netPay, 50000);
});
