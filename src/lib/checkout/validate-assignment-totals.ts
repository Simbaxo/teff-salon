
import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "./types";

// Ensure technician assignments reconcile with checkout charges.
// Service and add-on IDs must match the existing checkout selections.
export function validateCheckoutAssignmentTotals(
    services: CheckoutServiceAssignment[],
    addons: CheckoutAddonAssignment[],
    selectedServiceIds: number[],
    selectedAddonIds: number[],
    servicePrices: { serviceId: number; price: number }[],
    addonPrices: { addonId: number; price: number }[]
): void {
    // The existing checkout request identifies each service by ID.
    // Until that request supports repeated IDs, reject ambiguous repeats.
    const assignedServiceIds = services.map((item) => item.serviceId);
    const assignedAddonIds = addons.map((item) => item.addonId);

    if (
        new Set(assignedServiceIds).size !== assignedServiceIds.length ||
        new Set(assignedAddonIds).size !== assignedAddonIds.length
    ) {
        throw new Error("Duplicate checkout item ID");
    }

    const sameIds = (left: number[], right: number[]) =>
        left.length === right.length &&
        [...left].sort((a, b) => a - b).every(
            (id, index) => id === [...right].sort((a, b) => a - b)[index]
        );

    if (
        !sameIds(assignedServiceIds, selectedServiceIds) ||
        !sameIds(assignedAddonIds, selectedAddonIds)
    ) {
        throw new Error("Checkout assignments do not match selected items");
    }

    const servicePriceMap = new Map(
        servicePrices.map((item) => [item.serviceId, item.price])
    );

    const addonPriceMap = new Map(
        addonPrices.map((item) => [item.addonId, item.price])
    );

    if (
        servicePriceMap.size !== servicePrices.length ||
        addonPriceMap.size !== addonPrices.length ||
        servicePrices.length !== services.length ||
        addonPrices.length !== addons.length ||
        services.some(
            (item) =>
                servicePriceMap.get(item.serviceId) !== item.price
        ) ||
        addons.some(
            (item) =>
                addonPriceMap.get(item.addonId) !== item.price
        )
    ) {
        throw new Error("Checkout assignment prices do not match");
    }
}