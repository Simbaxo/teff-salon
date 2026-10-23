
type FixedWeeklySalaryInput = {
    compensationType: "COMMISSION" | "FIXED_WEEKLY";
    weeklySalary: number;
    salaryStartDate: Date | null;
    weekStart: Date;
};

// Payroll weekStart is a UTC-midnight calendar date.
// salaryStartDate represents a Colombia-local calendar date.
export function getFixedWeeklySalary(
    input: FixedWeeklySalaryInput
): number {
    if (
        input.compensationType !== "FIXED_WEEKLY" ||
        input.salaryStartDate === null
    ) {
        return 0;
    }

    const weekDate = input.weekStart
        .toISOString()
        .slice(0, 10);

    const salaryDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(input.salaryStartDate);

    return weekDate >= salaryDate
        ? input.weeklySalary
        : 0;
}
