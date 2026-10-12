
export type PayrollReconciliationInput = {
    // Original net payroll after deductions and delivered tips.
    netPay: number;

    // Commissions already paid before historical reconciliation.
    paidCommissions: number;

    // Previous payments recorded during reconciliation.
    historicalPayments: {
        amount: number;
    }[];
};

export function calculatePayrollReconciliation(
    input: PayrollReconciliationInput
) {
    const historicalPaymentsTotal =
        input.historicalPayments.reduce(
            (sum, payment) => sum + payment.amount,
            0
        );

    // Commissions already marked PAID must not be paid again.
    // Historical payments must not duplicate these amounts.
    const previouslyPaidTotal =
        input.paidCommissions + historicalPaymentsTotal;

    const remainingBalance =
        input.netPay - previouslyPaidTotal;

    return {
        netPay: input.netPay,
        paidCommissions: input.paidCommissions,
        historicalPaymentsTotal,
        previouslyPaidTotal,
        remainingBalance,
        isFullySettled: remainingBalance === 0,
        hasOverpayment: remainingBalance < 0,
    };
}