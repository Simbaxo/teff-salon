import { prisma } from "@/lib/prisma";
import { getExpenseOwner } from "@/lib/expenses/owner-auth";
import {
  getTeffDayStart,
  addTeffDays,
  getTeffDayOfWeek,
  getTeffToday,
} from "@/lib/datetime";
import { allocateWeeklySalaryToMonth } from "@/lib/expenses/allocate-weekly-salary";
import { calculateProfitLoss } from "@/lib/expenses/calculate-profit-loss";

const headers = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: Request) {
  const owner = await getExpenseOwner();

  if (!owner.success) {
    return Response.json(
      { error: owner.error },
      { status: owner.status, headers },
    );
  }

  const month = new URL(request.url).searchParams.get("month");

  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json(
      { error: "Mes inválido. Usa YYYY-MM." },
      { status: 400, headers },
    );
  }

  const [year, monthNumber] = month.split("-").map(Number);

  const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));

  const nextMonth = nextMonthDate.toISOString().slice(0, 7);

  // Sale.createdAt is a timestamp.
  // Use Colombia-local month boundaries.
  const saleStart = getTeffDayStart(`${month}-01`);
  const saleEnd = getTeffDayStart(`${nextMonth}-01`);

  // Expense and payroll dates are UTC-midnight calendar dates.
  const calendarStart = new Date(Date.UTC(year, monthNumber - 1, 1));

  const calendarEnd = new Date(Date.UTC(year, monthNumber, 1));

  // Include payroll weeks starting up to six days before
  // the month, since those weeks may overlap the month.
  const payrollStart = new Date(calendarStart);
  payrollStart.setUTCDate(payrollStart.getUTCDate() - 6);

  try {
    const [sales, expenses, payrollEntries, payrollPeriods] = await Promise.all(
      [
        prisma.sale.findMany({
          where: {
            createdAt: {
              gte: saleStart,
              lt: saleEnd,
            },
          },
          select: {
            finalTotal: true,
            commissions: {
              select: {
                commissionAmount: true,
              },
            },
          },
        }),

        prisma.expense.findMany({
          where: {
            reviewStatus: "APPROVED",
            expenseDate: {
              gte: calendarStart,
              lt: calendarEnd,
            },
          },
          select: {
            amount: true,
          },
        }),

        prisma.payrollEntry.findMany({
          where: {
            period: {
              startDate: {
                gte: payrollStart,
                lt: calendarEnd,
              },
            },
          },
          select: {
            salaryTotal: true,
            bonusesTotal: true,
            status: true,
            period: {
              select: {
                startDate: true,
              },
            },
          },
        }),
        prisma.payrollPeriod.findMany({
          where: {
            startDate: {
              gte: payrollStart,
              lt: calendarEnd,
            },
          },
          select: {
            startDate: true,
            status: true,
            _count: {
              select: {
                entries: true,
              },
            },
          },
        }),
      ],
    );

    const today = getTeffToday();

    const monthStartDate = `${month}-01`;
    const monthEndDate = addTeffDays(
      nextMonthDate.toISOString().slice(0, 10),
      -1,
    );

    // Find the Monday of the week containing the first day.
    const firstDayOfWeek = getTeffDayOfWeek(monthStartDate);

    const daysBackToMonday = (firstDayOfWeek + 6) % 7;

    const firstMonday = addTeffDays(monthStartDate, -daysBackToMonday);

    const payrollPeriodMap = new Map(
      payrollPeriods.map((period) => [
        period.startDate.toISOString().slice(0, 10),
        period,
      ]),
    );

    const missingPayrollWeeks: string[] = [];
    const unreviewedPayrollWeeks: string[] = [];

    for (
      let week = firstMonday;
      week <= monthEndDate;
      week = addTeffDays(week, 7)
    ) {
      // Do not flag future payroll weeks.
      if (week > today) {
        continue;
      }

      const period = payrollPeriodMap.get(week);

      if (!period || period._count.entries === 0) {
        missingPayrollWeeks.push(week);
      } else if (period.status === "DRAFT") {
        unreviewedPayrollWeeks.push(week);
      }
    }

    const salesRevenue = sales.reduce(
      (total, sale) => total + sale.finalTotal,
      0,
    );

    const technicianCommissions = sales.reduce(
      (total, sale) =>
        total +
        sale.commissions.reduce(
          (sum, commission) => sum + commission.commissionAmount,
          0,
        ),
      0,
    );

    const approvedExpenses = expenses.reduce(
      (total, expense) => total + expense.amount,
      0,
    );

    let confirmedSalaries = 0;
    let provisionalSalaries = 0;
    let confirmedBonuses = 0;
    let provisionalBonuses = 0;

    for (const entry of payrollEntries) {
      const salary = allocateWeeklySalaryToMonth(
        {
          weekStart: entry.period.startDate,
          salaryTotal: entry.salaryTotal,
        },
        month,
      );

      const bonuses = allocateWeeklySalaryToMonth(
        {
          weekStart: entry.period.startDate,
          salaryTotal: entry.bonusesTotal,
        },
        month,
      );

      if (entry.status === "DRAFT") {
        provisionalSalaries += salary;
        provisionalBonuses += bonuses;
      } else {
        confirmedSalaries += salary;
        confirmedBonuses += bonuses;
      }
    }

    const confirmed = calculateProfitLoss({
      salesRevenue,
      technicianCommissions,
      fixedSalaries: confirmedSalaries,
      payrollBonuses: confirmedBonuses,
      approvedExpenses,
    });

    const projected = calculateProfitLoss({
      salesRevenue,
      technicianCommissions,
      fixedSalaries: confirmedSalaries + provisionalSalaries,
      payrollBonuses: confirmedBonuses + provisionalBonuses,
      approvedExpenses,
    });

    return Response.json(
      {
        month,
        salesCount: sales.length,
        confirmed,
        projected,
        payrollCompleteness: {
          missingWeeks: missingPayrollWeeks,
          unreviewedWeeks: unreviewedPayrollWeeks,
          complete:
            missingPayrollWeeks.length === 0 &&
            unreviewedPayrollWeeks.length === 0,
        },
        breakdown: {
          technicianCommissions,
          confirmedSalaries,
          provisionalSalaries,
          confirmedBonuses,
          provisionalBonuses,
          approvedExpenses,
        },
        warnings: [
          ...(missingPayrollWeeks.length > 0
            ? [
                "Hay semanas sin nómina preparada. La utilidad puede estar sobreestimada.",
              ]
            : []),
          ...(unreviewedPayrollWeeks.length > 0
            ? ["Hay semanas con nómina pendiente de revisión."]
            : []),
          ...(provisionalSalaries > 0 || provisionalBonuses > 0
            ? ["Existen costos de nómina provisionales pendientes de revisión."]
            : []),
        ],
      },
      { headers },
    );
  } catch (error) {
    console.error("Failed to calculate profit and loss:", error);

    return Response.json(
      { error: "No se pudo calcular el estado de resultados." },
      { status: 500, headers },
    );
  }
}
