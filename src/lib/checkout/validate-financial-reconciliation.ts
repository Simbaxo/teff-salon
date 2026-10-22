
type CommissionSummary = {
    employeeId: number;
    commissionBase: number;
    commissionRate: number;
    commissionAmount: number;
};

// Verify that all charged revenue is attributed exactly once.
export function validateFinancialReconciliation(
    subtotal: number,
    discountTotal: number,
    finalTotal: number,
    commissions: CommissionSummary[]
): void {
    if (
        !Number.isSafeInteger(subtotal) ||
        !Number.isSafeInteger(discountTotal) ||
        !Number.isSafeInteger(finalTotal) ||
        subtotal < 0 ||
        discountTotal < 0 ||
        finalTotal < 0 ||
        subtotal - discountTotal !== finalTotal
    ) {
        throw new Error("CHECKOUT_TOTAL_MISMATCH");
    }

    const employeeIds = new Set<number>();
    let attributedTotal = 0;

    for (const commission of commissions) {
        if (
            !Number.isSafeInteger(commission.employeeId) ||
            commission.employeeId <= 0 ||
            employeeIds.has(commission.employeeId) ||
            !Number.isSafeInteger(commission.commissionBase) ||
            commission.commissionBase < 0 ||
            !Number.isSafeInteger(commission.commissionRate) ||
            commission.commissionRate !== 50 ||
            !Number.isSafeInteger(commission.commissionAmount) ||
            commission.commissionAmount !==
                Math.round(
                    commission.commissionBase *
                    (commission.commissionRate / 100)
                )
        ) {
            throw new Error("CHECKOUT_COMMISSION_MISMATCH");
        }

        employeeIds.add(commission.employeeId);
        attributedTotal += commission.commissionBase;

        if (!Number.isSafeInteger(attributedTotal)) {
            throw new Error("CHECKOUT_COMMISSION_MISMATCH");
        }
    }

    // Every peso after discounts must belong to one technician.
    if (attributedTotal !== finalTotal) {
        throw new Error("CHECKOUT_ATTRIBUTION_MISMATCH");
    }
}