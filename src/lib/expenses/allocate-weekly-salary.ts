import { addTeffDays } from "@/lib/datetime";

export type WeeklySalaryAllocation = {
  weekStart: Date;
  salaryTotal: number;
};

export function allocateWeeklySalaryToMonth(
  input: WeeklySalaryAllocation,
  month: string,
): number {
  const [year, monthNumber] = month.split("-").map(Number);

  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) ||
    !Number.isSafeInteger(input.salaryTotal) ||
    input.salaryTotal < 0
  ) {
    throw new Error("Invalid salary allocation input");
  }

  const startDate = input.weekStart.toISOString().slice(0, 10);

  const dailyBase = Math.floor(input.salaryTotal / 7);
  const remainder = input.salaryTotal % 7;

  let allocated = 0;

  for (let day = 0; day < 7; day++) {
    const calendarDate = addTeffDays(startDate, day);
    const [dayYear, dayMonth] = calendarDate.split("-").map(Number);

    if (dayYear !== year || dayMonth !== monthNumber) {
      continue;
    }

    // Assign the rounding remainder to the last day of the week.
    allocated += dailyBase + (day === 6 ? remainder : 0);
  }

  return allocated;
}
