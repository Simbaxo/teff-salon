
import {
    calculatePayroll,
    type PayrollAdjustmentInput,
} from "./calculations";

type WeeklyCommission = {
    employeeId: number;
    commissionBase: number;
    commissionAmount: number;
    status: string;
    payrollEntryId: number | null;
};

type WeeklyTip = {
    employeeId: number;
    amount: number;
    status: string;
    payrollEntryId: number | null;
};

type WeeklySummaryInput = {
    employeeId: number;
    payrollEntryId: number | null;
    commissions: WeeklyCommission[];
    tips: WeeklyTip[];
    adjustments: PayrollAdjustmentInput[];
};

// Pure calculation helper: no database writes.
export function calculateWeeklyPayrollSummary(
    input: WeeklySummaryInput
) {
    const employeeCommissions =
        input.commissions.filter(
            (item) => item.employeeId === input.employeeId
        );

    const employeeTips = input.tips.filter(
        (item) => item.employeeId === input.employeeId
    );

    const totals = calculatePayroll({
        commissions: employeeCommissions,
        tips: employeeTips,
        adjustments: input.adjustments,
    });

    const paidCommissions = employeeCommissions
        .filter((item) => item.status === "PAID")
        .reduce(
            (sum, item) => sum + item.commissionAmount,
            0
        );

    const pendingCommissions = employeeCommissions
        .filter((item) => item.status === "PENDING")
        .reduce(
            (sum, item) => sum + item.commissionAmount,
            0
        );

    // An assignment to this entry is valid; another entry is a conflict.
    const conflictingCommissions =
        employeeCommissions.filter(
            (item) =>
                item.payrollEntryId !== null &&
                item.payrollEntryId !== input.payrollEntryId
        ).length;

    const conflictingTips = employeeTips.filter(
        (item) =>
            item.payrollEntryId !== null &&
            item.payrollEntryId !== input.payrollEntryId
    ).length;

    const outstandingPay =
        totals.netPay - paidCommissions;

    return {
        ...totals,
        paidCommissions,
        pendingCommissions,
        outstandingPay,
        conflictingCommissions,
        conflictingTips,
        requiresReview:
            outstandingPay < 0 ||
            conflictingCommissions > 0 ||
            conflictingTips > 0,
    };
}
