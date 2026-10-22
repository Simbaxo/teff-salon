
import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "./types";

import { prepareAttributedFinancials } from "./prepare-attributed-financials";
import { validateFinancialReconciliation } from "./validate-financial-reconciliation";

type TipRecipient = {
    employeeId: number;
};

// Build a reconciled financial snapshot from validated assignments.
// The caller must validate service ownership and prices first.
export function buildAttributedCheckout(
    services: CheckoutServiceAssignment[],
    addons: CheckoutAddonAssignment[],
    discountTotal: number,
    tips: TipRecipient[]
) {
    const financials = prepareAttributedFinancials(
        services,
        addons,
        discountTotal,
        tips
    );

    const finalTotal = financials.subtotal - discountTotal;

    // Reject any discrepancy before creating financial records.
    validateFinancialReconciliation(
        financials.subtotal,
        discountTotal,
        finalTotal,
        financials.commissions
    );

    return {
        subtotal: financials.subtotal,
        discountTotal,
        finalTotal,
        commissions: financials.commissions,
        eligibleEmployeeIds: financials.eligibleEmployeeIds,
    };
}