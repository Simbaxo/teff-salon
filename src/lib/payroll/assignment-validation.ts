
type PayrollAssignmentSummary = {
    employeeId: number;
    commissionIds: number[];
    tipIds: number[];
};

export function validatePayrollAssignments(
    summaries: PayrollAssignmentSummary[]
) {
    const commissionIds = new Set<number>();
    const tipIds = new Set<number>();

    const duplicateCommissions: number[] = [];
    const duplicateTips: number[] = [];

    for (const summary of summaries) {
        // Each commission must belong to only one statement.
        for (const id of summary.commissionIds) {
            if (commissionIds.has(id)) {
                duplicateCommissions.push(id);
            }

            commissionIds.add(id);
        }

        // Each tip must belong to only one statement.
        for (const id of summary.tipIds) {
            if (tipIds.has(id)) {
                duplicateTips.push(id);
            }

            tipIds.add(id);
        }
    }

    return {
        valid:
            duplicateCommissions.length === 0 &&
            duplicateTips.length === 0,
        duplicateCommissions,
        duplicateTips,
    };
}


type PayrollFinancialRecord = {
    id: number;
};

type PayrollAssignmentCompletenessInput = {
    commissions: PayrollFinancialRecord[];
    tips: PayrollFinancialRecord[];
    summaries: {
        commissionIds: number[];
        tipIds: number[];
    }[];
};

// Verify every source record appears in exactly one statement.
export function validatePayrollAssignmentCompleteness(
    input: PayrollAssignmentCompletenessInput
) {
    const sourceCommissionIds = new Set(
        input.commissions.map((item) => item.id)
    );

    const sourceTipIds = new Set(
        input.tips.map((item) => item.id)
    );

    const assignedCommissionIds =
        input.summaries.flatMap(
            (item) => item.commissionIds
        );

    const assignedTipIds =
        input.summaries.flatMap(
            (item) => item.tipIds
        );

    const assignedCommissionSet =
        new Set(assignedCommissionIds);

    const assignedTipSet =
        new Set(assignedTipIds);

    const missingCommissions = [
        ...sourceCommissionIds,
    ].filter((id) => !assignedCommissionSet.has(id));

    const missingTips = [
        ...sourceTipIds,
    ].filter((id) => !assignedTipSet.has(id));

    const unexpectedCommissions =
        assignedCommissionIds.filter(
            (id) => !sourceCommissionIds.has(id)
        );

    const unexpectedTips = assignedTipIds.filter(
        (id) => !sourceTipIds.has(id)
    );

    return {
        valid:
            missingCommissions.length === 0 &&
            missingTips.length === 0 &&
            unexpectedCommissions.length === 0 &&
            unexpectedTips.length === 0,
        missingCommissions,
        missingTips,
        unexpectedCommissions,
        unexpectedTips,
    };
}