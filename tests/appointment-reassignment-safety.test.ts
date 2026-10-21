
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    assertReassignmentFinancialSafety,
} from "../src/lib/appointments/reassignment-safety";

// Appointments without a sale can still be reassigned.
test("allows reassignment before checkout", () => {
    assert.doesNotThrow(() =>
        assertReassignmentFinancialSafety(null)
    );
});

// Sold appointments must use a separate financial correction workflow.
test("blocks reassignment after checkout", () => {
    assert.throws(
        () => assertReassignmentFinancialSafety(150),
        /SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED/
    );
});

// Even an older sale must remain protected.
test("blocks reassignment for historical sales", () => {
    assert.throws(
        () => assertReassignmentFinancialSafety(1),
        /SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED/
    );
});

// A sale ID of zero must not bypass the protection.
test("does not treat zero as an unsold appointment", () => {
    assert.throws(
        () => assertReassignmentFinancialSafety(0),
        /SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED/
    );
});