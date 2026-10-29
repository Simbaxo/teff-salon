
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    resolveSaleItemCustomer,
} from "../src/lib/technicians/resolve-sale-item-customer";

function makeCustomer(
    customerId: number,
    name: string
) {
    return {
        customerId,
        customer: { name },
    };
}

function makeItem(
    appointment: ReturnType<typeof makeCustomer> | null,
    saleCustomers: ReturnType<typeof makeCustomer>[]
) {
    return {
        appointment,
        sale: {
            saleAppointments: saleCustomers.map(
                (customer) => ({
                    appointment: customer,
                })
            ),
        },
    };
}

test("resolves customer from a directly linked appointment", () => {
    const result = resolveSaleItemCustomer(
        makeItem(
            makeCustomer(10, "Andrea"),
            [makeCustomer(10, "Andrea")]
        )
    );

    assert.deepEqual(result, {
        status: "RESOLVED",
        customerId: 10,
        customerName: "Andrea",
    });
});

test("resolves checkout-added service without appointmentId", () => {
    const result = resolveSaleItemCustomer(
        makeItem(null, [
            makeCustomer(10, "Andrea"),
        ])
    );

    assert.deepEqual(result, {
        status: "RESOLVED",
        customerId: 10,
        customerName: "Andrea",
    });
});

test("deduplicates multiple appointments for one customer", () => {
    const result = resolveSaleItemCustomer(
        makeItem(null, [
            makeCustomer(10, "Andrea"),
            makeCustomer(10, "Andrea"),
        ])
    );

    assert.equal(result.status, "RESOLVED");
    assert.equal(result.customerId, 10);
});

test("flags sales containing different customers", () => {
    const result = resolveSaleItemCustomer(
        makeItem(null, [
            makeCustomer(10, "Andrea"),
            makeCustomer(20, "Camila"),
        ])
    );

    assert.deepEqual(result, {
        status: "AMBIGUOUS",
        customerId: null,
        customerName: null,
    });
});

test("flags sales without customer ownership", () => {
    const result = resolveSaleItemCustomer(
        makeItem(null, [])
    );

    assert.deepEqual(result, {
        status: "UNKNOWN",
        customerId: null,
        customerName: null,
    });
});

test("prefers direct appointment attribution in a multi-customer sale", () => {
    const result = resolveSaleItemCustomer(
        makeItem(
            makeCustomer(20, "Camila"),
            [
                makeCustomer(10, "Andrea"),
                makeCustomer(20, "Camila"),
            ]
        )
    );

    assert.deepEqual(result, {
        status: "RESOLVED",
        customerId: 20,
        customerName: "Camila",
    });
});

test("resolves an appointment-linked item without sale appointment links", () => {
    const result = resolveSaleItemCustomer(
        makeItem(
            makeCustomer(10, "Andrea"),
            []
        )
    );

    assert.equal(result.status, "RESOLVED");
    assert.equal(result.customerId, 10);
});