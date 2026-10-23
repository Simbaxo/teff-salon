
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
    addonPrices: {
        instanceId?: string;
        addonId: number;
        price: number;
    }[]
): void {
    const assignedServiceIds = services.map((item) => item.serviceId);
    const assignedAddonIds = addons.map((item) => item.addonId);

    // Preserve the existing service-ID restriction.
    if (new Set(assignedServiceIds).size !== assignedServiceIds.length) {
        throw new Error("Duplicate checkout item ID");
    }

    const hasRepeatedAddonIds =
        new Set(assignedAddonIds).size !== assignedAddonIds.length;

    const instanceIds = addons.map((item) => item.instanceId);

    const allLegacy = instanceIds.every(
        (id) => id === undefined
    );

    const allInstanceAware = instanceIds.every(
        (id) =>
            typeof id === "string" &&
            id.trim().length > 0
    );

    const hasDuplicateInstanceIds =
        new Set(instanceIds).size !== instanceIds.length;

    // Accept either the original legacy format or the new
    // instance-aware format. Never mix both formats.
    if (
        (!allLegacy && !allInstanceAware) ||
        (allLegacy && hasRepeatedAddonIds) ||
        (allInstanceAware && hasDuplicateInstanceIds)
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

    // Compare each add-on occurrence, not just its catalog ID.
    const addonKey = (item: {
        instanceId?: string;
        addonId: number;
    }) =>
        item.instanceId === undefined
            ? `legacy-${item.addonId}`
            : `instance-${item.instanceId}`;

    const addonPriceMap = new Map(
        addonPrices.map((item) => [
            addonKey(item),
            item,
        ])
    );

    const hasInvalidAddonPrices = addonPrices.some(
        (item) =>
            !Number.isSafeInteger(item.addonId) ||
            item.addonId <= 0 ||
            !Number.isSafeInteger(item.price) ||
            item.price < 0 ||
            (item.instanceId !== undefined &&
                (typeof item.instanceId !== "string" ||
                    item.instanceId.trim().length === 0))
    );

    if (
        servicePriceMap.size !== servicePrices.length ||
        addonPriceMap.size !== addonPrices.length ||
        servicePrices.length !== services.length ||
        addonPrices.length !== addons.length ||
        hasInvalidAddonPrices ||
        services.some(
            (item) =>
                servicePriceMap.get(item.serviceId) !== item.price
        ) ||
        addons.some((item) => {
            const submitted = addonPriceMap.get(addonKey(item));

            return (
                !submitted ||
                submitted.addonId !== item.addonId ||
                submitted.price !== item.price
            );
        })
    ) {
        throw new Error("Checkout assignment prices do not match");
    }
}