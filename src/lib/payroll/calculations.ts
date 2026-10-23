export type PayrollAdjustmentInput = {
    type:
        | "BONUS"
        | "LOAN"
        | "UNIFORM"
        | "OTHER_DEDUCTION";
    amount: number;
};

export type PayrollCalculationInput = {
    // Fixed weekly salary in Colombian pesos.
    // Commission-based technicians default to zero.
    salaryTotal?: number;
    commissions: {
        commissionBase: number;
        commissionAmount: number;
    }[];

    tips: {
        amount: number;
        status: string;
    }[];

    adjustments: PayrollAdjustmentInput[];
};

export function calculatePayroll(
    input: PayrollCalculationInput
) {
    const productionTotal = input.commissions.reduce(
        (sum, item) => sum + item.commissionBase,
        0
    );

    const commissionTotal = input.commissions.reduce(
        (sum, item) => sum + item.commissionAmount,
        0
    );

    const tipsTotal = input.tips.reduce(
        (sum, item) => sum + item.amount,
        0
    );

    // Tips already delivered must not be paid again.
    const tipsAlreadyPaid = input.tips
        .filter((tip) => tip.status === "PAID")
        .reduce((sum, tip) => sum + tip.amount, 0);

    const adjustmentTotal = (
        type: PayrollAdjustmentInput["type"]
    ) =>
        input.adjustments
            .filter((item) => item.type === type)
            .reduce((sum, item) => sum + item.amount, 0);

    const bonusesTotal = adjustmentTotal("BONUS");
    const loansTotal = adjustmentTotal("LOAN");
    const uniformsTotal = adjustmentTotal("UNIFORM");
    const otherDeductions =
        adjustmentTotal("OTHER_DEDUCTION");

    const salaryTotal = input.salaryTotal ?? 0;

    const totalEarned =
        salaryTotal +
        commissionTotal +
        tipsTotal +
        bonusesTotal;

    const netPay =
        totalEarned -
        loansTotal -
        uniformsTotal -
        otherDeductions -
        tipsAlreadyPaid;

    return {
        salaryTotal,
        productionTotal,
        commissionTotal,
        tipsTotal,
        bonusesTotal,
        totalEarned,
        loansTotal,
        uniformsTotal,
        otherDeductions,
        tipsAlreadyPaid,
        netPay,
    };
}