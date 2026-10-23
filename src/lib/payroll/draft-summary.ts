
import {
    calculateWeeklyPayrollSummary,
} from "./weekly-summary";

import {
    calculatePayrollReconciliation,
} from "./reconciliation";

type DraftCommission = {
    employeeId: number;
    commissionBase: number;
    commissionAmount: number;
    status: string;
    payrollEntryId: number | null;
};

type DraftTip = {
    employeeId: number;
    amount: number;
    status: string;
    payrollEntryId: number | null;
};

type DraftAdjustment = {
    type:
        | "BONUS"
        | "LOAN"
        | "UNIFORM"
        | "OTHER_DEDUCTION";
    amount: number;
};

type DraftSummaryInput = {
    employeeId: number;
    payrollEntryId: number | null;
    // Fixed weekly salary, zero for commission-based employees.
    salaryTotal?: number;
    commissions: DraftCommission[];
    tips: DraftTip[];
    adjustments: DraftAdjustment[];
    historicalPayments: {
        amount: number;
    }[];
};

// Calculate earnings and reconciliation without database writes.
export function calculatePayrollDraftSummary(
    input: DraftSummaryInput
) {
    const weekly = calculateWeeklyPayrollSummary({
        employeeId: input.employeeId,
        payrollEntryId: input.payrollEntryId,
        salaryTotal: input.salaryTotal ?? 0,
        commissions: input.commissions,
        tips: input.tips,
        adjustments: input.adjustments,
    });

    // Historical payments are separate from earnings.
    const reconciliation = calculatePayrollReconciliation({
        netPay: weekly.netPay,
        paidCommissions: weekly.paidCommissions,
        historicalPayments: input.historicalPayments,
    });

    return {
        ...weekly,
        historicalPaymentsTotal:
            reconciliation.historicalPaymentsTotal,
        previouslyPaidTotal:
            reconciliation.previouslyPaidTotal,
        remainingBalance:
            reconciliation.remainingBalance,
        isFullySettled:
            reconciliation.isFullySettled,
        hasOverpayment:
            reconciliation.hasOverpayment,

        // Flag statements requiring manual reconciliation.
        requiresReconciliation:
            weekly.requiresReview ||
            reconciliation.hasOverpayment,
    };
}