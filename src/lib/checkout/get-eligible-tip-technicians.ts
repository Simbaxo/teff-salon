
type TipEligibilityInput =
    | {
          mode: "legacy";
          appointmentEmployeeIds: number[];
      }
    | {
          mode: "attributed";
          assignedEmployeeIds: number[];
      };

// Determine who may receive tips for this checkout.
// Attributed checkout uses validated service technicians.
export function getEligibleTipTechnicians(
    input: TipEligibilityInput
): Set<number> {
    const employeeIds =
        input.mode === "attributed"
            ? input.assignedEmployeeIds
            : input.appointmentEmployeeIds;

    const eligible = new Set<number>();

    for (const employeeId of employeeIds) {
        if (
            !Number.isSafeInteger(employeeId) ||
            employeeId <= 0
        ) {
            throw new Error("INVALID_TIP_ELIGIBILITY");
        }

        eligible.add(employeeId);
    }

    return eligible;
}