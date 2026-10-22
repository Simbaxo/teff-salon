
import { getEligibleTipTechnicians } from "./get-eligible-tip-technicians";

type Commission = {
    employeeId: number;
    commissionBase: number;
    commissionRate: number;
    commissionAmount: number;
};

type AttributedFinancials = {
    commissions: Commission[];
    eligibleEmployeeIds: number[];
};

type FinancialSelectionInput =
    | {
          mode: "legacy";
          commissions: Commission[];
          appointmentEmployeeIds: number[];
      }
    | {
          mode: "attributed";
          financials: AttributedFinancials;
      };

// Select one consistent financial source for the checkout.
// Never mix appointment-based and service-level attribution.
export function selectCheckoutFinancials(
    input: FinancialSelectionInput
) {
    if (input.mode === "attributed") {
        return {
            mode: "attributed" as const,
            commissions: input.financials.commissions,
            eligibleTipEmployees: getEligibleTipTechnicians({
                mode: "attributed",
                assignedEmployeeIds:
                    input.financials.eligibleEmployeeIds,
            }),
        };
    }

    return {
        mode: "legacy" as const,
        commissions: input.commissions,
        eligibleTipEmployees: getEligibleTipTechnicians({
            mode: "legacy",
            appointmentEmployeeIds: input.appointmentEmployeeIds,
        }),
    };
}