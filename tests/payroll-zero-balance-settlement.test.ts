
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    canSettleZeroBalance,
} from "../src/lib/payroll/zero-balance-settlement";

test("allows a reviewed zero-balance statement", () => {
    assert.equal(
        canSettleZeroBalance({
            entryStatus: "REVIEWED",
            periodStatus: "REVIEWED",
            remainingBalance: 0,
            hasOverpayment: false,
        }),
        true
    );
});

test("rejects a statement with money outstanding", () => {
    assert.equal(
        canSettleZeroBalance({
            entryStatus: "REVIEWED",
            periodStatus: "REVIEWED",
            remainingBalance: 50000,
            hasOverpayment: false,
        }),
        false
    );
});

test("rejects an overpaid statement", () => {
    assert.equal(
        canSettleZeroBalance({
            entryStatus: "REVIEWED",
            periodStatus: "REVIEWED",
            remainingBalance: -10000,
            hasOverpayment: true,
        }),
        false
    );
});

test("rejects draft payroll", () => {
    assert.equal(
        canSettleZeroBalance({
            entryStatus: "DRAFT",
            periodStatus: "DRAFT",
            remainingBalance: 0,
            hasOverpayment: false,
        }),
        false
    );
});

test("rejects an already paid statement", () => {
    assert.equal(
        canSettleZeroBalance({
            entryStatus: "PAID",
            periodStatus: "REVIEWED",
            remainingBalance: 0,
            hasOverpayment: false,
        }),
        false
    );
});

test("rejects settlement when the period is paid", () => {
    assert.equal(
        canSettleZeroBalance({
            entryStatus: "REVIEWED",
            periodStatus: "PAID",
            remainingBalance: 0,
            hasOverpayment: false,
        }),
        false
    );
});