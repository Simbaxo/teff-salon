
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Prisma } from "../src/generated/prisma/client";
import { validateAttributedCheckout } from "../src/lib/checkout/validate-attributed-checkout";

// Mock the reference data returned by Prisma.
function createMockTransaction() {
    const tx = {
        appointmentService: {
            findMany: async () => [
                {
                    appointmentId: 101,
                    serviceId: 10,
                    appointment: { employeeId: 1 },
                },
                {
                    appointmentId: 102,
                    serviceId: 20,
                    appointment: { employeeId: 2 },
                },
            ],
        },
        employee: {
            findMany: async () => [
                { id: 1 },
                { id: 2 },
            ],
        },
        employeeService: {
            findMany: async () => [
                { employeeId: 1, serviceId: 10 },
                { employeeId: 2, serviceId: 20 },
            ],
        },
        serviceAddon: {
            findMany: async () => [
                { serviceId: 10, addonId: 5 },
            ],
        },
    } as unknown as Prisma.TransactionClient;

    return tx;
}

const input = {
    appointmentIds: [101, 102],
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
    selectedServiceIds: [10, 20],
    selectedAddonIds: [5],
    servicePrices: [
        { serviceId: 10, price: 60000 },
        { serviceId: 20, price: 60000 },
    ],
    addonPrices: [
        { addonId: 5, price: 15000 },
    ],
    discountTotal: 15000,
    tips: [{ employeeId: 2 }],
};

test("validates and reconciles a multi-technician checkout", async () => {
    const result = await validateAttributedCheckout(
        createMockTransaction(),
        input
    );

    assert.equal(result.subtotal, 135000);
    assert.equal(result.finalTotal, 120000);

    assert.deepEqual(
        result.commissions.map((item) => item.commissionBase),
        [66667, 53333]
    );
});

test("rejects mismatched checkout prices", async () => {
    await assert.rejects(
        validateAttributedCheckout(
            createMockTransaction(),
            {
                ...input,
                servicePrices: [
                    { serviceId: 10, price: 70000 },
                    { serviceId: 20, price: 60000 },
                ],
            }
        ),
        /Checkout assignment prices do not match/
    );
});

test("rejects duplicate service assignments", async () => {
    await assert.rejects(
        validateAttributedCheckout(
            createMockTransaction(),
            {
                ...input,
                services: [
                    input.services[0],
                    { ...input.services[0] },
                ],
            }
        ),
        /Duplicate checkout item ID/
    );
});

test("rejects unrelated tip recipients", async () => {
    await assert.rejects(
        validateAttributedCheckout(
            createMockTransaction(),
            {
                ...input,
                tips: [{ employeeId: 999 }],
            }
        ),
        /INVALID_TIP_EMPLOYEE/
    );
});

test("rejects invalid add-on relationships", async () => {
    await assert.rejects(
        validateAttributedCheckout(
            createMockTransaction(),
            {
                ...input,
                addons: [{
                    addonId: 5,
                    serviceIndex: 1,
                    price: 15000,
                }],
            }
        ),
        /Add-on is not allowed/
    );
});

test("rejects invalid appointment ownership", async () => {
    await assert.rejects(
        validateAttributedCheckout(
            createMockTransaction(),
            {
                ...input,
                services: [
                    {
                        ...input.services[0],
                        appointmentId: 999,
                    },
                    input.services[1],
                ],
            }
        ),
        /does not belong to this visit/
    );
});