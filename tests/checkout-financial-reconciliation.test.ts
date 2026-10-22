
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    validateFinancialReconciliation,
} from "../src/lib/checkout/validate-financial-reconciliation";

const validCommissions = [
    {
        employeeId: 1,
        commissionBase: 66667,
        commissionRate: 50,
        commissionAmount: 33334,
    },
    {
        employeeId: 2,
        commissionBase: 53333,
        commissionRate: 50,
        commissionAmount: 26667,
    },
];

test("accepts a reconciled multi-technician sale", () => {
    assert.doesNotThrow(() =>
        validateFinancialReconciliation(
            135000,
            15000,
            120000,
            validCommissions
        )
    );
});

test("rejects an incorrect final sale total", () => {
    assert.throws(
        () =>
            validateFinancialReconciliation(
                135000,
                15000,
                119000,
                validCommissions
            ),
        /CHECKOUT_TOTAL_MISMATCH/
    );
});

test("rejects commission bases that do not reconcile", () => {
    const commissions = [
        validCommissions[0],
        {
            ...validCommissions[1],
            commissionBase: 50000,
            commissionAmount: 25000,
        },
    ];

    assert.throws(
        () =>
            validateFinancialReconciliation(
                135000,
                15000,
                120000,
                commissions
            ),
        /CHECKOUT_ATTRIBUTION_MISMATCH/
    );
});

test("rejects duplicate technician commissions", () => {
    const commissions = [
        validCommissions[0],
        {
            ...validCommissions[1],
            employeeId: 1,
        },
    ];

    assert.throws(
        () =>
            validateFinancialReconciliation(
                135000,
                15000,
                120000,
                commissions
            ),
        /CHECKOUT_COMMISSION_MISMATCH/
    );
});

test("rejects an incorrect commission amount", () => {
    const commissions = [
        {
            ...validCommissions[0],
            commissionAmount: 30000,
        },
        validCommissions[1],
    ];

    assert.throws(
        () =>
            validateFinancialReconciliation(
                135000,
                15000,
                120000,
                commissions
            ),
        /CHECKOUT_COMMISSION_MISMATCH/
    );
});

test("rejects an incorrect commission rate", () => {
    const commissions = [
        {
            ...validCommissions[0],
            commissionRate: 60,
        },
        validCommissions[1],
    ];

    assert.throws(
        () =>
            validateFinancialReconciliation(
                135000,
                15000,
                120000,
                commissions
            ),
        /CHECKOUT_COMMISSION_MISMATCH/
    );
});

test("rejects negative commission bases", () => {
    const commissions = [
        {
            ...validCommissions[0],
            commissionBase: -1000,
        },
        validCommissions[1],
    ];

    assert.throws(
        () =>
            validateFinancialReconciliation(
                135000,
                15000,
                120000,
                commissions
            ),
        /CHECKOUT_COMMISSION_MISMATCH/
    );
});

test("accepts a single-technician sale", () => {
    assert.doesNotThrow(() =>
        validateFinancialReconciliation(
            60000,
            0,
            60000,
            [{
                employeeId: 1,
                commissionBase: 60000,
                commissionRate: 50,
                commissionAmount: 30000,
            }]
        )
    );
});

test("rejects an unattributed sale", () => {
    assert.throws(
        () =>
            validateFinancialReconciliation(
                60000,
                0,
                60000,
                []
            ),
        /CHECKOUT_ATTRIBUTION_MISMATCH/
    );
});