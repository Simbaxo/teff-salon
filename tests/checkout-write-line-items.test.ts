
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Prisma } from "../src/generated/prisma/client";
import { writeCheckoutLineItems } from "../src/lib/checkout/write-checkout-line-items";

function createMockTransaction() {
    const records: Array<Record<string, unknown>> = [];
    let createManyCalls = 0;
    let createCalls = 0;

    const tx = {
        saleLineItem: {
            createMany: async ({ data }: {
                data: Array<Record<string, unknown>>;
            }) => {
                createManyCalls++;
                records.push(...data);
                return { count: data.length };
            },

            create: async ({ data }: {
                data: Record<string, unknown>;
            }) => {
                createCalls++;
                const id = records.length + 1;
                records.push({ id, ...data });
                return { id };
            },
        },
    } as unknown as Prisma.TransactionClient;

    return {
        tx,
        records,
        get createManyCalls() {
            return createManyCalls;
        },
        get createCalls() {
            return createCalls;
        },
    };
}

test("legacy checkout writes existing line-item format", async () => {
    const mock = createMockTransaction();

    await writeCheckoutLineItems(mock.tx, {
        mode: "legacy",
        saleId: 100,
        items: [
            {
                itemType: "SERVICE",
                itemId: 10,
                itemName: "Manicure",
                unitPrice: 60000,
            },
            {
                itemType: "ADDON",
                itemId: 5,
                itemName: "Retiro",
                unitPrice: 15000,
            },
        ],
    });

    assert.equal(mock.createManyCalls, 1);
    assert.equal(mock.createCalls, 0);
    assert.equal(mock.records.length, 2);

    assert.deepEqual(mock.records[0], {
        saleId: 100,
        itemType: "SERVICE",
        itemId: 10,
        itemName: "Manicure",
        unitPrice: 60000,
    });
});

test("attributed checkout saves technician ownership", async () => {
    const mock = createMockTransaction();

    await writeCheckoutLineItems(mock.tx, {
        mode: "attributed",
        saleId: 100,
        services: [
            {
                serviceId: 10,
                appointmentId: 101,
                employeeId: 1,
                price: 60000,
            },
            {
                serviceId: 20,
                appointmentId: 102,
                employeeId: 2,
                price: 60000,
            },
        ],
        addons: [],
        catalogServices: [
            { id: 10, nameEs: "Manicure" },
            { id: 20, nameEs: "Pedicure" },
        ],
        catalogAddons: [],
    });

    assert.equal(mock.createManyCalls, 0);
    assert.equal(mock.createCalls, 2);

    assert.equal(mock.records[0].employeeId, 1);
    assert.equal(mock.records[0].appointmentId, 101);
    assert.equal(mock.records[1].employeeId, 2);
    assert.equal(mock.records[1].appointmentId, 102);
});

test("attributed add-ons inherit parent technician", async () => {
    const mock = createMockTransaction();

    await writeCheckoutLineItems(mock.tx, {
        mode: "attributed",
        saleId: 100,
        services: [{
            serviceId: 10,
            appointmentId: 101,
            employeeId: 1,
            price: 60000,
        }],
        addons: [{
            addonId: 5,
            serviceIndex: 0,
            price: 15000,
        }],
        catalogServices: [
            { id: 10, nameEs: "Manicure" },
        ],
        catalogAddons: [
            { id: 5, nameEs: "Retiro" },
        ],
    });

    assert.equal(mock.createManyCalls, 0);
    assert.equal(mock.createCalls, 2);

    assert.equal(mock.records[1].employeeId, 1);
    assert.equal(mock.records[1].appointmentId, 101);
    assert.equal(mock.records[1].parentLineItemId, 1);
});

test("rejects an unknown attributed service", async () => {
    const mock = createMockTransaction();

    await assert.rejects(
        writeCheckoutLineItems(mock.tx, {
            mode: "attributed",
            saleId: 100,
            services: [{
                serviceId: 999,
                appointmentId: null,
                employeeId: 1,
                price: 60000,
            }],
            addons: [],
            catalogServices: [],
            catalogAddons: [],
        }),
        /CHECKOUT_SERVICE_NOT_FOUND/
    );

    assert.equal(mock.records.length, 0);
});

test("rejects an invalid attributed add-on parent", async () => {
    const mock = createMockTransaction();

    await assert.rejects(
        writeCheckoutLineItems(mock.tx, {
            mode: "attributed",
            saleId: 100,
            services: [{
                serviceId: 10,
                appointmentId: 101,
                employeeId: 1,
                price: 60000,
            }],
            addons: [{
                addonId: 5,
                serviceIndex: 99,
                price: 15000,
            }],
            catalogServices: [
                { id: 10, nameEs: "Manicure" },
            ],
            catalogAddons: [
                { id: 5, nameEs: "Retiro" },
            ],
        }),
        /CHECKOUT_ADDON_PARENT_INVALID/
    );

    // The service was inserted before the add-on validation failed.
    // The calling database transaction must roll back this write.
    assert.equal(mock.records.length, 1);
});