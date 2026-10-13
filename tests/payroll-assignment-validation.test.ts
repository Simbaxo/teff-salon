
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    validatePayrollAssignments,
    validateAssignmentUpdateCount,
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

test("accepts matching assignment update counts", () => {
    assert.equal(
        validateAssignmentUpdateCount(3, 3),
        true
    );
});

test("rejects incomplete assignment updates", () => {
    assert.equal(
        validateAssignmentUpdateCount(3, 2),
        false
    );
});

test("rejects unexpected extra updates", () => {
    assert.equal(
        validateAssignmentUpdateCount(3, 4),
        false
    );
});

test("accepts zero records when none are expected", () => {
    assert.equal(
        validateAssignmentUpdateCount(0, 0),
        true
    );
});