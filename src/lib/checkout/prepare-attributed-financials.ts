
import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "./types";

import {
    calculateCheckoutCommissions,
} from "./technician-attribution";

type CheckoutTipRecipient = {
    employeeId: number;
};

// Prepare financial attribution from validated service assignments.
// Call only after assignment, price, and add-on validation succeeds.
export function prepareAttributedFinancials(
    services: CheckoutServiceAssignment[],
    addons: CheckoutAddonAssignment[],
    discountTotal: number,
    tips: CheckoutTipRecipient[]
) {
    const revenueItems = services.map((service) => ({
        employeeId: service.employeeId,
        price: service.price,
    }));

    // Add-ons belong to the technician assigned to their parent service.
    for (const addon of addons) {
        const parent = services[addon.serviceIndex];

        if (!parent) {
            throw new Error("CHECKOUT_ADDON_PARENT_INVALID");
        }

        revenueItems.push({
            employeeId: parent.employeeId,
            price: addon.price,
        });
    }

    const subtotal = revenueItems.reduce(
        (total, item) => total + item.price,
        0
    );

    if (!Number.isSafeInteger(subtotal)) {
        throw new Error("INVALID_ATTRIBUTED_SUBTOTAL");
    }

    const commissions = calculateCheckoutCommissions(
        revenueItems,
        discountTotal
    );

    // Tip recipients must have performed at least one selected service.
    const eligibleEmployeeIds = new Set(
        services.map((service) => service.employeeId)
    );

    const hasInvalidTipRecipient = tips.some(
        (tip) => !eligibleEmployeeIds.has(tip.employeeId)
    );

    if (hasInvalidTipRecipient) {
        throw new Error("INVALID_TIP_EMPLOYEE");
    }

    const commissionBaseTotal = commissions.reduce(
        (total, commission) => total + commission.commissionBase,
        0
    );

    // Every peso after discounts must belong to a technician.
    if (commissionBaseTotal !== subtotal - discountTotal) {
        throw new Error("CHECKOUT_ATTRIBUTION_MISMATCH");
    }

    return {
        subtotal,
        commissions,
        eligibleEmployeeIds: [...eligibleEmployeeIds],
    };
}