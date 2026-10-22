
import type { Prisma } from "@/generated/prisma/client";

import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "./types";

import { loadCheckoutAssignmentContext } from "./load-assignment-context";
import { validateCheckoutAssignments } from "./validate-assignments";
import { validateCheckoutAssignmentTotals } from "./validate-assignment-totals";
import { buildAttributedCheckout } from "./build-attributed-checkout";

type CheckoutTip = {
    employeeId: number;
};

type CheckoutPrice = {
    serviceId: number;
    price: number;
};

type CheckoutAddonPrice = {
    addonId: number;
    price: number;
};

// Validate and reconcile technician assignments inside checkout's
// existing protected transaction, before creating financial records.
export async function validateAttributedCheckout(
    tx: Prisma.TransactionClient,
    input: {
        appointmentIds: number[];
        services: CheckoutServiceAssignment[];
        addons: CheckoutAddonAssignment[];
        selectedServiceIds: number[];
        selectedAddonIds: number[];
        servicePrices: CheckoutPrice[];
        addonPrices: CheckoutAddonPrice[];
        discountTotal: number;
        tips: CheckoutTip[];
    }
) {
    // Reconcile the submitted items and prices before database reads.
    validateCheckoutAssignmentTotals(
        input.services,
        input.addons,
        input.selectedServiceIds,
        input.selectedAddonIds,
        input.servicePrices,
        input.addonPrices
    );

    // Load trusted reference data within the protected transaction.
    const context = await loadCheckoutAssignmentContext(tx, {
        appointmentIds: input.appointmentIds,
        services: input.services,
        addons: input.addons,
    });

    // Confirm technician eligibility, appointment ownership,
    // and add-on compatibility against database records.
    validateCheckoutAssignments(
        input.services,
        input.addons,
        context
    );

    // Calculate commissions and verify financial reconciliation.
    return buildAttributedCheckout(
        input.services,
        input.addons,
        input.discountTotal,
        input.tips
    );
}