
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    selectCheckoutFinancials,
} from "../src/lib/checkout/select-checkout-financials";

const legacyCommissions = [
    {
        employeeId: 1,
        commissionBase: 60000,
        commissionRate: 50,
        commissionAmount: 30000,
    },
];

const attributedCommissions = [
    {
        employeeId: 2,
        commissionBase: 75000,
        commissionRate: 50,
        commissionAmount: 37500,
    },
    {
        employeeId: 3,
        commissionBase: 60000,
        commissionRate: 50,
        commissionAmount: 30000,
    },
];

test("legacy checkout preserves appointment-based commissions", () => {
    const result = selectCheckoutFinancials({
        mode: "legacy",
        commissions: legacyCommissions,
        appointmentEmployeeIds: [1],
    });

    assert.equal(result.mode, "legacy");
    assert.deepEqual(result.commissions, legacyCommissions);
    assert.deepEqual([...result.eligibleTipEmployees], [1]);
});

test("attributed checkout uses service-level commissions", () => {
    const result = selectCheckoutFinancials({
        mode: "attributed",
        financials: {
            commissions: attributedCommissions,
            eligibleEmployeeIds: [2, 3],
        },
    });

    assert.equal(result.mode, "attributed");
    assert.deepEqual(result.commissions, attributedCommissions);
    assert.deepEqual([...result.eligibleTipEmployees], [2, 3]);
});

test("attributed checkout excludes original unassigned technician", () => {
    const result = selectCheckoutFinancials({
        mode: "attributed",
        financials: {
            commissions: attributedCommissions,
            eligibleEmployeeIds: [2, 3],
        },
    });

    assert.equal(result.eligibleTipEmployees.has(1), false);
});

test("deduplicates eligible tip technicians", () => {
    const result = selectCheckoutFinancials({
        mode: "attributed",
        financials: {
            commissions: attributedCommissions,
            eligibleEmployeeIds: [2, 2, 3],
        },
    });

    assert.deepEqual([...result.eligibleTipEmployees], [2, 3]);
});

test("rejects invalid attributed tip technician IDs", () => {
    assert.throws(
        () => selectCheckoutFinancials({
            mode: "attributed",
            financials: {
                commissions: attributedCommissions,
                eligibleEmployeeIds: [2, 0],
            },
        }),
        /INVALID_TIP_ELIGIBILITY/
    );
});

test("rejects invalid legacy appointment technician IDs", () => {
    assert.throws(
        () => selectCheckoutFinancials({
            mode: "legacy",
            commissions: legacyCommissions,
            appointmentEmployeeIds: [-1],
        }),
        /INVALID_TIP_ELIGIBILITY/
    );
});