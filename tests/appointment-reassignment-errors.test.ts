
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    getReassignmentErrorResponse,
} from "../src/lib/appointments/reassignment-errors";

const errorCases = [
    {
        code: "REASSIGNMENT_STATUS_FORBIDDEN",
        status: 403,
        conflictType: "STATUS_FORBIDDEN",
    },
    {
        code: "REASSIGNMENT_EMPLOYEE_INVALID",
        status: 409,
        conflictType: "EMPLOYEE_INVALID",
    },
    {
        code: "APPOINTMENT_CHANGED",
        status: 409,
        conflictType: "APPOINTMENT_CHANGED",
    },
    {
        code: "SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED",
        status: 409,
        conflictType: "SOLD_APPOINTMENT",
    },
    {
        code: "REASSIGNMENT_APPOINTMENT_CONFLICT",
        status: 409,
        conflictType: "APPOINTMENT",
    },
    {
        code: "REASSIGNMENT_BLOCK_CONFLICT",
        status: 409,
        conflictType: "SCHEDULE_BLOCK",
    },
    {
        code: "PAYROLL_LOCKED",
        status: 409,
        conflictType: "PAYROLL_LOCKED",
    },
] as const;

// Verify every error retains its intended HTTP status.
for (const errorCase of errorCases) {
    test(`maps ${errorCase.code} correctly`, () => {
        const result = getReassignmentErrorResponse(
            new Error(errorCase.code)
        );

        assert.ok(result);
        assert.equal(result.status, errorCase.status);
        assert.equal(
            result.body.conflictType,
            errorCase.conflictType
        );
        assert.ok(result.body.error.length > 0);
    });
}

test("maps serialization retry exhaustion to HTTP 409", () => {
    const result = getReassignmentErrorResponse(
        new Error("REASSIGNMENT_CONFLICT")
    );

    assert.ok(result);
    assert.equal(result.status, 409);
    assert.ok(result.body.error.length > 0);
});

test("returns null for unexpected errors", () => {
    assert.equal(
        getReassignmentErrorResponse(
            new Error("UNEXPECTED_DATABASE_ERROR")
        ),
        null
    );
});

test("returns null for non-Error values", () => {
    assert.equal(
        getReassignmentErrorResponse("PAYROLL_LOCKED"),
        null
    );
});