
export type ManualPaymentInput = {
    amount: number;
};

export type ManualPaymentBalanceInput = {
    netPay: number;
    paidCommissions: number;
    historicalPayments: ManualPaymentInput[];
    manualPayments: ManualPaymentInput[];
};

// Calculate how much is still owed after recorded payments.
export function calculateManualPaymentBalance(
    input: ManualPaymentBalanceInput
) {
    const historicalPaymentsTotal =
        input.historicalPayments.reduce(
            (sum, payment) => sum + payment.amount,
            0
        );

    const manualPaymentsTotal =
        input.manualPayments.reduce(
            (sum, payment) => sum + payment.amount,
            0
        );

    // Delivered tips are already deducted from netPay.
    const totalPreviouslyPaid =
        input.paidCommissions +
        historicalPaymentsTotal +
        manualPaymentsTotal;

    const remainingBalance =
        input.netPay - totalPreviouslyPaid;

    return {
        netPay: input.netPay,
        paidCommissions: input.paidCommissions,
        historicalPaymentsTotal,
        manualPaymentsTotal,
        totalPreviouslyPaid,
        remainingBalance,
        isFullyPaid: remainingBalance === 0,
        hasOverpayment: remainingBalance < 0,
    };
}