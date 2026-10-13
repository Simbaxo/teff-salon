
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    validatePayrollAssignments,
} from "../src/lib/payroll/assignment-validation";

// Each financial record belongs to one technician.
test("accepts unique payroll assignments", () => {
    const result = validatePayrollAssignments([
        {
            employeeId: 1,
            commissionIds: [10, 11],
            tipIds: [20],
        },
        {
            employeeId: 2,
            commissionIds: [12],
            tipIds: [21],
        },
    ]);

    assert.equal(result.valid, true);
    assert.deepEqual(result.duplicateCommissions, []);
    assert.deepEqual(result.duplicateTips, []);
});

// A commission must not appear in two statements.
test("detects duplicate commission assignments", () => {
    const result = validatePayrollAssignments([
        {
            employeeId: 1,
            commissionIds: [10],
            tipIds: [],
        },
        {
            employeeId: 2,
            commissionIds: [10],
            tipIds: [],
        },
    ]);

    assert.equal(result.valid, false);
    assert.deepEqual(result.duplicateCommissions, [10]);
});

// A tip must not appear in two statements.
test("detects duplicate tip assignments", () => {
    const result = validatePayrollAssignments([
        {
            employeeId: 1,
            commissionIds: [],
            tipIds: [20],
        },
        {
            employeeId: 2,
            commissionIds: [],
            tipIds: [20],
        },
    ]);

    assert.equal(result.valid, false);
    assert.deepEqual(result.duplicateTips, [20]);
});

// A technician may have no earnings during the week.
test("accepts empty payroll assignments", () => {
    const result = validatePayrollAssignments([
        {
            employeeId: 1,
            commissionIds: [],
            tipIds: [],
        },
    ]);

    assert.equal(result.valid, true);
});

// Duplicate IDs within the same statement are invalid too.
test("detects repeated IDs within one statement", () => {
    const result = validatePayrollAssignments([
        {
            employeeId: 1,
            commissionIds: [10, 10],
            tipIds: [20, 20],
        },
    ]);

    assert.equal(result.valid, false);
    assert.deepEqual(result.duplicateCommissions, [10]);
    assert.deepEqual(result.duplicateTips, [20]);
});
