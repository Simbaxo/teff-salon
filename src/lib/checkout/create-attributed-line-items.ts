
import type { Prisma } from "@/generated/prisma/client";

import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "./types";

type CatalogItem = {
    id: number;
    nameEs: string;
};

// Save the technician responsible for each sold service and add-on.
// Call only after the server has validated the complete checkout.
export async function createAttributedLineItems(
    tx: Prisma.TransactionClient,
    input: {
        saleId: number;
        services: CheckoutServiceAssignment[];
        addons: CheckoutAddonAssignment[];
        catalogServices: CatalogItem[];
        catalogAddons: CatalogItem[];
    }
): Promise<void> {
    const {
        saleId,
        services,
        addons,
        catalogServices,
        catalogAddons,
    } = input;

    const serviceLineItems: {
        id: number;
        employeeId: number;
        appointmentId: number | null;
    }[] = [];

    // Create services individually so we can reference their IDs.
    for (const assignment of services) {
        const service = catalogServices.find(
            (item) => item.id === assignment.serviceId
        );

        if (!service) {
            throw new Error("CHECKOUT_SERVICE_NOT_FOUND");
        }

        const lineItem = await tx.saleLineItem.create({
            data: {
                saleId,
                itemType: "SERVICE",
                itemId: service.id,
                itemName: service.nameEs,
                unitPrice: assignment.price,
                employeeId: assignment.employeeId,
                appointmentId: assignment.appointmentId,
            },
            select: {
                id: true,
            },
        });

        serviceLineItems.push({
            id: lineItem.id,
            employeeId: assignment.employeeId,
            appointmentId: assignment.appointmentId,
        });
    }

    // Every add-on inherits the technician of its parent service.
    for (const assignment of addons) {
        const addon = catalogAddons.find(
            (item) => item.id === assignment.addonId
        );

        const parent = serviceLineItems[assignment.serviceIndex];

        if (!addon || !parent) {
            throw new Error("CHECKOUT_ADDON_PARENT_INVALID");
        }

        await tx.saleLineItem.create({
            data: {
                saleId,
                itemType: "ADDON",
                itemId: addon.id,
                itemName: addon.nameEs,
                unitPrice: assignment.price,
                employeeId: parent.employeeId,
                appointmentId: parent.appointmentId,
                parentLineItemId: parent.id,
            },
        });
    }
}