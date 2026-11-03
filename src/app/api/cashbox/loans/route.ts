import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageStaff } from "@/lib/auth-roles";
import { getTeffToday, getTeffDayOfWeek, addTeffDays } from "@/lib/datetime";
import { lockCashbox } from "@/lib/cashbox/lock";
import { calculateCashboxBalance } from "@/lib/cashbox/balance";
import { validateCashboxLoan } from "@/lib/cashbox/loan-validation";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { getFixedWeeklySalary } from "@/lib/payroll/fixed-weekly-salary";
import { calculateWeeklyPayrollSummary } from "@/lib/payroll/weekly-summary";
import { calculateManualPaymentBalance } from "@/lib/payroll/manual-payments";
import { isCashboxWriteEnabled } from "@/lib/cashbox/is-write-enabled";
import {
  hasValidCommissionPayrollAttribution,
  hasValidPayrollAttribution,
} from "@/lib/payroll/review-validation";

export async function POST(request: Request) {
  if (!isCashboxWriteEnabled()) {
    return Response.json(
      {
        error: "Los registros de caja estarán disponibles próximamente.",
        code: "CASHBOX_WRITES_DISABLED",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = Number(session.user.id);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return Response.json({ error: "Usuario inválido." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const validation = validateCashboxLoan(body);

  if (!validation.success) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  const { employeeId, amount, description, idempotencyKey } = validation.data;

  // The payroll week is determined by Medellin time.
  const today = getTeffToday();
  const weekday = getTeffDayOfWeek(today);

  const week = addTeffDays(today, -(weekday === 0 ? 6 : weekday - 1));

  const nextMonday = addTeffDays(week, 7);

  const startDate = new Date(`${week}T00:00:00.000Z`);

  const serviceEnd = new Date(`${nextMonday}T00:00:00.000Z`);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Always acquire payroll lock before cashbox lock.
        await lockPayrollWeek(tx, startDate);
        await lockCashbox(tx);

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            active: true,
            role: true,
          },
        });

        if (!user?.active || !canManageStaff(user.role)) {
          throw new Error("UNAUTHORIZED_USER");
        }

        // Idempotency prevents duplicate cash withdrawals
        // and duplicate payroll deductions.
        const existingMovement = await tx.cashMovement.findUnique({
          where: { idempotencyKey },
          include: {
            payrollAdjustment: {
              select: {
                entry: {
                  select: {
                    period: {
                      select: {
                        startDate: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (existingMovement) {
          if (
            existingMovement.type !== "TECHNICIAN_LOAN" ||
            existingMovement.employeeId !== employeeId ||
            existingMovement.amount !== -amount ||
            existingMovement.recordedById !== userId ||
            existingMovement.description !== description ||
            existingMovement.payrollAdjustmentId === null
          ) {
            throw new Error("DUPLICATE_REFERENCE");
          }

          const originalWeek =
            existingMovement.payrollAdjustment?.entry.period.startDate
              .toISOString()
              .slice(0, 10);

          if (!originalWeek) {
            throw new Error("DUPLICATE_REFERENCE");
          }

          return {
            duplicate: true,
            movementId: existingMovement.id,
            week: originalWeek,
            amount,
          };
        }

        const employee = await tx.employee.findUnique({
          where: { id: employeeId },
          select: {
            id: true,
            name: true,
            active: true,
            compensationType: true,
            weeklySalary: true,
            salaryStartDate: true,
          },
        });

        if (!employee?.active || employee.compensationType !== "COMMISSION") {
          throw new Error("INVALID_EMPLOYEE");
        }

        const cashbox = await tx.cashbox.findUnique({
          where: { id: 1 },
          select: {
            id: true,
            openingBalance: true,
            openedAt: true,
          },
        });

        if (!cashbox) {
          throw new Error("CASHBOX_NOT_INITIALIZED");
        }

        const cash = await calculateCashboxBalance(tx, cashbox);

        if (cash.balance < amount) {
          throw new Error("INSUFFICIENT_CASH");
        }

        const existingPeriod = await tx.payrollPeriod.findUnique({
          where: { startDate },
          include: {
            entries: {
              where: { employeeId },
              include: {
                adjustments: true,
                historicalPayments: true,
                manualPayments: true,
              },
            },
          },
        });

        if (
          existingPeriod &&
          (existingPeriod.status !== "DRAFT" ||
            existingPeriod.reconciliationStatus === "SETTLED")
        ) {
          throw new Error("PAYROLL_LOCKED");
        }

        const existingEntry = existingPeriod?.entries[0] ?? null;

        if (existingEntry && existingEntry.status !== "DRAFT") {
          throw new Error("PAYROLL_LOCKED");
        }

        // Use finalized sale attribution rather than
        // relying only on the appointment technician.
        const commissions = await tx.commission.findMany({
          where: {
            employeeId,
            sale: {
              saleAppointments: {
                some: {
                  appointment: {
                    date: {
                      gte: startDate,
                      lt: serviceEnd,
                    },
                  },
                },
              },
            },
          },
          select: {
            employeeId: true,
            commissionBase: true,
            commissionAmount: true,
            status: true,
            payrollEntryId: true,
            sale: {
              select: {
                lineItems: {
                  select: {
                    employeeId: true,
                    unitPrice: true,
                  },
                },
                saleAppointments: {
                  select: {
                    appointment: {
                      select: {
                        employeeId: true,
                        date: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        const tips = await tx.tip.findMany({
          where: {
            employeeId,
            sale: {
              saleAppointments: {
                some: {
                  appointment: {
                    date: {
                      gte: startDate,
                      lt: serviceEnd,
                    },
                  },
                },
              },
            },
          },
          select: {
            employeeId: true,
            amount: true,
            status: true,
            payrollEntryId: true,
            sale: {
              select: {
                saleAppointments: {
                  select: {
                    appointment: {
                      select: {
                        employeeId: true,
                        date: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        // Reject invalid attribution, cross-week sales,
        // and records assigned to another payroll entry.
        const validCommissions = commissions.every(
          (item) =>
            ["PENDING", "PAID"].includes(item.status) &&
            hasValidCommissionPayrollAttribution(item, startDate, serviceEnd) &&
            item.sale.saleAppointments.every(
              ({ appointment }) =>
                appointment.date >= startDate && appointment.date < serviceEnd,
            ) &&
            (item.payrollEntryId === null ||
              item.payrollEntryId === existingEntry?.id),
        );

        const validTips = tips.every(
          (item) =>
            ["PENDING", "PAID"].includes(item.status) &&
            hasValidPayrollAttribution(item, startDate, serviceEnd) &&
            item.sale.saleAppointments.every(
              ({ appointment }) =>
                appointment.date >= startDate && appointment.date < serviceEnd,
            ) &&
            (item.payrollEntryId === null ||
              item.payrollEntryId === existingEntry?.id),
        );

        if (!validCommissions || !validTips) {
          throw new Error("PAYROLL_ATTRIBUTION_ERROR");
        }

        const salaryTotal = getFixedWeeklySalary({
          compensationType: employee.compensationType,
          weeklySalary: employee.weeklySalary,
          salaryStartDate: employee.salaryStartDate,
          weekStart: startDate,
        });

        const adjustments = [
          ...(existingEntry?.adjustments ?? []).map((item) => ({
            type: item.type,
            amount: item.amount,
          })),
          {
            type: "LOAN" as const,
            amount,
          },
        ];

        const totals = calculateWeeklyPayrollSummary({
          employeeId,
          payrollEntryId: existingEntry?.id ?? null,
          salaryTotal,
          commissions,
          tips,
          adjustments,
        });

        const balance = calculateManualPaymentBalance({
          netPay: totals.netPay,
          paidCommissions: totals.paidCommissions,
          historicalPayments: existingEntry?.historicalPayments ?? [],
          manualPayments: existingEntry?.manualPayments ?? [],
        });

        if (
          totals.requiresReview ||
          balance.remainingBalance < 0 ||
          !Number.isSafeInteger(balance.remainingBalance)
        ) {
          throw new Error("INSUFFICIENT_PAYROLL");
        }

        // No financial writes until all checks pass.
        const period = await tx.payrollPeriod.upsert({
          where: { startDate },
          update: {},
          create: {
            startDate,
            endDate: new Date(`${addTeffDays(week, 6)}T00:00:00.000Z`),
            payday: serviceEnd,
            status: "DRAFT",
          },
        });

        if (period.status !== "DRAFT") {
          throw new Error("PAYROLL_LOCKED");
        }

        const entry = await tx.payrollEntry.upsert({
          where: {
            payrollPeriodId_employeeId: {
              payrollPeriodId: period.id,
              employeeId,
            },
          },
          update: {},
          create: {
            payrollPeriodId: period.id,
            employeeId,
            status: "DRAFT",
          },
        });

        if (entry.status !== "DRAFT") {
          throw new Error("PAYROLL_LOCKED");
        }

        const adjustment = await tx.payrollAdjustment.create({
          data: {
            payrollEntryId: entry.id,
            type: "LOAN",
            amount,
            description: description || `Préstamo de caja - ${today}`,
          },
        });

        const movement = await tx.cashMovement.create({
          data: {
            cashboxId: cashbox.id,
            type: "TECHNICIAN_LOAN",
            amount: -amount,
            description,
            recordedById: userId,
            employeeId,
            payrollAdjustmentId: adjustment.id,
            idempotencyKey,
          },
        });

        // Save the recalculated payroll totals.
        // Only persist financial fields, not summary
        // metadata such as paidCommissions or requiresReview.
        await tx.payrollEntry.update({
          where: {
            id: entry.id,
          },
          data: {
            salaryTotal: totals.salaryTotal,
            productionTotal: totals.productionTotal,
            commissionTotal: totals.commissionTotal,
            tipsTotal: totals.tipsTotal,
            bonusesTotal: totals.bonusesTotal,
            totalEarned: totals.totalEarned,
            loansTotal: totals.loansTotal,
            uniformsTotal: totals.uniformsTotal,
            otherDeductions: totals.otherDeductions,
            tipsAlreadyPaid: totals.tipsAlreadyPaid,
            netPay: totals.netPay,
          },
        });

        return {
          duplicate: false,
          movementId: movement.id,
          week,
          amount,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    return Response.json(
      {
        success: true,
        duplicate: result.duplicate,
        movementId: result.movementId,
        week: result.week,
        amount: result.amount,
        message: result.duplicate
          ? "Este préstamo ya estaba registrado."
          : "Préstamo registrado y descontado de la nómina.",
      },
      {
        status: result.duplicate ? 200 : 201,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2034", "P2002"].includes(error.code)
    ) {
      return Response.json(
        {
          error:
            "La operación cambió durante el registro. Actualiza e inténtalo nuevamente con la misma referencia.",
        },
        { status: 409 },
      );
    }

    const errors: Record<string, { message: string; status: number }> = {
      UNAUTHORIZED_USER: {
        message: "Usuario no autorizado.",
        status: 403,
      },
      DUPLICATE_REFERENCE: {
        message: "Esta referencia ya pertenece a otro movimiento.",
        status: 409,
      },
      INVALID_EMPLOYEE: {
        message: "Técnica inválida o inactiva.",
        status: 400,
      },
      CASHBOX_NOT_INITIALIZED: {
        message: "La caja todavía no está activada.",
        status: 409,
      },
      INSUFFICIENT_CASH: {
        message: "No hay suficiente efectivo disponible en caja.",
        status: 409,
      },
      PAYROLL_LOCKED: {
        message: "La nómina de esta semana ya fue revisada o cerrada.",
        status: 409,
      },
      PAYROLL_ATTRIBUTION_ERROR: {
        message:
          "Existen inconsistencias en la asignación de comisiones o propinas. Solicita revisión del propietario.",
        status: 409,
      },
      INSUFFICIENT_PAYROLL: {
        message:
          "El préstamo supera el saldo disponible de nómina de la técnica.",
        status: 409,
      },
      INVALID_CASHBOX_BALANCE: {
        message: "El saldo de caja requiere revisión.",
        status: 409,
      },
    };

    const code = error instanceof Error ? error.message : "";

    const knownError = errors[code];

    if (knownError) {
      return Response.json(
        {
          error: knownError.message,
          code,
        },
        { status: knownError.status },
      );
    }

    console.error("Failed to register cashbox technician loan:", error);

    return Response.json(
      {
        error: "No se pudo registrar el préstamo. No se guardaron cambios.",
      },
      { status: 500 },
    );
  }
}
