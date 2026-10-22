
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    getEligibleTipTechnicians,
} from "../src/lib/checkout/get-eligible-tip-technicians";

test("legacy checkout uses original appointment technicians", () => {
    const eligible = getEligibleTipTechnicians({
        mode: "legacy",
        appointmentEmployeeIds: [1, 2],
    });

    assert.deepEqual([...eligible], [1, 2]);
});

test("attributed checkout uses selected service technicians", () => {
    const eligible = getEligibleTipTechnicians({
        mode: "attributed",
        assignedEmployeeIds: [2, 3],
    });

    assert.deepEqual([...eligible], [2, 3]);
    assert.equal(eligible.has(1), false);
});

test("deduplicates technicians working on multiple services", () => {
    const eligible = getEligibleTipTechnicians({
        mode: "attributed",
        assignedEmployeeIds: [1, 1, 2, 1],
    });

    assert.deepEqual([...eligible], [1, 2]);
});

test("rejects invalid technician IDs", () => {
    assert.throws(
        () => getEligibleTipTechnicians({
            mode: "attributed",
            assignedEmployeeIds: [1, 0],
        }),
        /INVALID_TIP_ELIGIBILITY/
    );
});

test("rejects negative technician IDs", () => {
    assert.throws(
        () => getEligibleTipTechnicians({
            mode: "legacy",
            appointmentEmployeeIds: [-1],
        }),
        /INVALID_TIP_ELIGIBILITY/
    );
});

test("rejects non-integer technician IDs", () => {
    assert.throws(
        () => getEligibleTipTechnicians({
            mode: "attributed",
            assignedEmployeeIds: [1.5],
        }),
        /INVALID_TIP_ELIGIBILITY/
    );
});

test("handles an empty technician list", () => {
    const eligible = getEligibleTipTechnicians({
        mode: "attributed",
        assignedEmployeeIds: [],
    });

    assert.equal(eligible.size, 0);
});