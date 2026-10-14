
export type ManualPaymentIdentity = {
    payrollEntryId: number;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    paymentReference: string | null;
    description: string | null;
    recordedByUserId: number;
};

// Compare payment details to recognize an identical retry.
// The database separately enforces unique idempotency keys.
export function isSameManualPayment(
    existing: ManualPaymentIdentity,
    proposed: ManualPaymentIdentity
): boolean {
    return (
        existing.payrollEntryId === proposed.payrollEntryId &&
        existing.amount === proposed.amount &&
        existing.paymentDate === proposed.paymentDate &&
        existing.paymentMethod === proposed.paymentMethod &&
        existing.paymentReference === proposed.paymentReference &&
        existing.description === proposed.description &&
        existing.recordedByUserId === proposed.recordedByUserId
    );
}