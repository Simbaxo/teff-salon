
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Prisma } from "../src/generated/prisma/client";
import { createAttributedLineItems } from "../src/lib/checkout/create-attributed-line-items";

type CreatedLineItem = {
    id: number;
    saleId: number;
    itemType: string;
    itemId: number | null;
    itemName: string;
    unitPrice: number;
    employeeId: number | null;
    appointmentId: number | null;
    parentLineItemId: number | null;
};

// Mock only the database operation used by the helper.
function createMockTransaction() {
    const records: CreatedLineItem[] = [];

    const tx = {
        saleLineItem: {
            create: async ({ data }: {
                data: Omit<CreatedLineItem, "id">;
            }) => {
                // Preserve the parent relationship when provided.
                // Standalone service lines have no parent.
                const record = {
                    id: records.length + 1,
                    ...data,
                };

                records.push(record);
                return { id: record.id };
            },
        },
    } as unknown as Prisma.TransactionClient;

    return { tx, records };
}

const input = {
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
    addons: [
        {
            addonId: 5,
            serviceIndex: 0,
            price: 15000,
        },
    ],
    catalogServices: [
        { id: 10, nameEs: "Manicure" },
        { id: 20, nameEs: "Pedicure" },
    ],
    catalogAddons: [
        { id: 5, nameEs: "Retiro" },
    ],
};

test("creates service lines with their technicians", async () => {
    const { tx, records } = createMockTransaction();

    await createAttributedLineItems(tx, input);

    assert.equal(records.length, 3);

    assert.equal(records[0].employeeId, 1);
    assert.equal(records[0].appointmentId, 101);
    assert.equal(records[0].unitPrice, 60000);

    assert.equal(records[1].employeeId, 2);
    assert.equal(records[1].appointmentId, 102);
});

test("links add-ons to their parent service", async () => {
    const { tx, records } = createMockTransaction();

    await createAttributedLineItems(tx, input);

    assert.equal(records[2].itemType, "ADDON");
    assert.equal(records[2].employeeId, 1);
    assert.equal(records[2].appointmentId, 101);
    assert.equal(records[2].parentLineItemId, records[0].id);
});

test("supports newly added services without appointments", async () => {
    const { tx, records } = createMockTransaction();

    await createAttributedLineItems(tx, {
        ...input,
        services: [
            {
                serviceId: 10,
                appointmentId: null,
                employeeId: 2,
                price: 60000,
            },
        ],
        addons: [],
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].employeeId, 2);
    assert.equal(records[0].appointmentId, null);
});

test("rejects an unknown service", async () => {
    const { tx } = createMockTransaction();

    await assert.rejects(
        createAttributedLineItems(tx, {
            ...input,
            services: [
                {
                    serviceId: 999,
                    appointmentId: null,
                    employeeId: 1,
                    price: 60000,
                },
            ],
            addons: [],
        }),
        /CHECKOUT_SERVICE_NOT_FOUND/
    );
});

test("rejects an invalid add-on parent", async () => {
    const { tx } = createMockTransaction();

    await assert.rejects(
        createAttributedLineItems(tx, {
            ...input,
            addons: [
                {
                    addonId: 5,
                    serviceIndex: 99,
                    price: 15000,
                },
            ],
        }),
        /CHECKOUT_ADDON_PARENT_INVALID/
    );
});