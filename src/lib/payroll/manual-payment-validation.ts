
import {
    validateHistoricalPayment,
    type HistoricalPaymentMethod,
} from "./historical-payment-validation";

export type ManualPaymentInput = {
    payrollEntryId: number;
    amount: number;
    paymentDate: string;
    paymentMethod: HistoricalPaymentMethod;
    description: string | null;
    idempotencyKey: string;
    paymentReference: string | null;
    confirmedDelivered: true;
    confirmedNotPreviouslyRecorded: true;
};

// Reuse historical payment validation for manual payments.
export function validateManualPayment(input: unknown):
    | { success: true; data: ManualPaymentInput }
    | { success: false; error: string } {

    const result = validateHistoricalPayment(input);

    if (!result.success) {
        return result;
    }

    return {
        success: true,
        data: {
            ...result.data,
            confirmedDelivered: true,
            confirmedNotPreviouslyRecorded: true,
        },
    };
}