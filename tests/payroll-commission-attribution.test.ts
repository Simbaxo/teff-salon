
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    hasValidCommissionPayrollAttribution,
} from "../src/lib/payroll/review-validation";

const start = new Date("2026-10-26T00:00:00.000Z");
const end = new Date("2026-11-02T00:00:00.000Z");
const serviceDate = new Date("2026-10-29T00:00:00.000Z");

test("accepts Sale #106 multi-technician attribution", () => {
    const result = hasValidCommissionPayrollAttribution(
        {
            employeeId: 4,
            commissionBase: 155000,
            sale: {
                saleAppointments: [
                    {
                        appointment: {
                            employeeId: 2,
                            date: serviceDate,
                        },
                    },
                ],
                lineItems: [
                    { employeeId: 2, unitPrice: 85000 },
                    { employeeId: 4, unitPrice: 110000 },
                    { employeeId: 4, unitPrice: 20000 },
                    { employeeId: 4, unitPrice: 25000 },
                ],
            },
        },
        start,
        end
    );

    assert.equal(result, true);
});

test("rejects a commission without attributed revenue", () => {
    const result = hasValidCommissionPayrollAttribution(
        {
            employeeId: 4,
            commissionBase: 155000,
            sale: {
                saleAppointments: [
                    {
                        appointment: {
                            employeeId: 2,
                            date: serviceDate,
                        },
                    },
                ],
                lineItems: [
                    { employeeId: 2, unitPrice: 155000 },
                ],
            },
        },
        start,
        end
    );

    assert.equal(result, false);
});

test("preserves legacy appointment attribution", () => {
    const result = hasValidCommissionPayrollAttribution(
        {
            employeeId: 4,
            commissionBase: 50000,
            sale: {
                saleAppointments: [
                    {
                        appointment: {
                            employeeId: 4,
                            date: serviceDate,
                        },
                    },
                ],
                lineItems: [
                    { employeeId: null, unitPrice: 50000 },
                ],
            },
        },
        start,
        end
    );

    assert.equal(result, true);
});

test("rejects partially attributed checkout records", () => {
    const result = hasValidCommissionPayrollAttribution(
        {
            employeeId: 4,
            commissionBase: 100000,
            sale: {
                saleAppointments: [
                    {
                        appointment: {
                            employeeId: 4,
                            date: serviceDate,
                        },
                    },
                ],
                lineItems: [
                    { employeeId: 4, unitPrice: 100000 },
                    { employeeId: null, unitPrice: 20000 },
                ],
            },
        },
        start,
        end
    );

    assert.equal(result, false);
});