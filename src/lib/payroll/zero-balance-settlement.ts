
export type ZeroBalanceSettlementInput = {
    entryStatus: string;
    periodStatus: string;
    remainingBalance: number;
    hasOverpayment: boolean;
};

// Pure validation: no database operations.
export function canSettleZeroBalance(
    input: ZeroBalanceSettlementInput
): boolean {
    return (
        input.entryStatus === "REVIEWED" &&
        input.periodStatus === "REVIEWED" &&
        input.remainingBalance === 0 &&
        !input.hasOverpayment
    );
}