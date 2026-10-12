
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { validatePayrollWeek } from "@/lib/payroll/review-validation";
import { addTeffDays } from "@/lib/datetime";
import { calculatePayrollDraftSummary } from "@/lib/payroll/draft-summary";

import {
    hasValidPayrollAttribution,
    saleSpansPayrollWeeks,
} from "@/lib/payroll/review-validation";

// Read-only preparation. No payroll entries are created yet.
export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (session.user.role !== "OWNER") {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return Response.json(
            { error: "JSON inválido." },
            { status: 400 }
        );
    }

    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        !("week" in body)
    ) {
        return Response.json(
            { error: "Semana inválida." },
            { status: 400 }
        );
    }

    const serviceStart = validatePayrollWeek(body.week);

    if (!serviceStart) {
        return Response.json(
            { error: "La semana debe comenzar un lunes válido." },
            { status: 400 }
        );
    }

    const week = serviceStart.toISOString().slice(0, 10);
    const serviceEnd = new Date(
        `${addTeffDays(week, 7)}T00:00:00.000Z`
    );

    try {
        const result = await prisma.$transaction(
            async (tx) => {
                // Serialize payroll preparation with financial writes.
                await lockPayrollWeek(tx, serviceStart);

                const period = await tx.payrollPeriod.findUnique({
                    where: { startDate: serviceStart },
                    include: {
                        entries: {
                            select: {
                                id: true,
                                employeeId: true,
                                status: true,
                                adjustments: {
                                    select: {
                                        type: true,
                                        amount: true,
                                    },
                                },
                                historicalPayments: {
                                    select: {
                                        amount: true,
                                    },
                                },
                            },
                        },
                    },
                });

                if (
                    period &&
                    (
                        period.status !== "DRAFT" ||
                        period.reconciliationStatus === "SETTLED" ||
                        period.entries.some(
                            (entry) => entry.status !== "DRAFT"
                        )
                    )
                ) {
                    throw new Error("PAYROLL_LOCKED");
                }

                // Include active employees, existing statements,
                // and technicians with earnings this week.
                const employees = await tx.employee.findMany({
                    where: {
                        OR: [
                            { active: true },
                            {
                                payrollEntries: {
                                    some: {
                                        period: {
                                            startDate: serviceStart,
                                        },
                                    },
                                },
                            },
                            {
                                commissions: {
                                    some: {
                                        sale: {
                                            saleAppointments: {
                                                some: {
                                                    appointment: {
                                                        date: {
                                                            gte: serviceStart,
                                                            lt: serviceEnd,
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            {
                                tips: {
                                    some: {
                                        sale: {
                                            saleAppointments: {
                                                some: {
                                                    appointment: {
                                                        date: {
                                                            gte: serviceStart,
                                                            lt: serviceEnd,
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                    select: {
                        id: true,
                        name: true,
                    },
                    orderBy: { name: "asc" },
                });


                // Load all commissions linked to services this week.
                const commissions = await tx.commission.findMany({
                    where: {
                        sale: {
                            saleAppointments: {
                                some: {
                                    appointment: {
                                        date: {
                                            gte: serviceStart,
                                            lt: serviceEnd,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    select: {
                        id: true,
                        employeeId: true,
                        commissionBase: true,
                        commissionAmount: true,
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

                // Load tips using the same service-date rule.
                const tips = await tx.tip.findMany({
                    where: {
                        sale: {
                            saleAppointments: {
                                some: {
                                    appointment: {
                                        date: {
                                            gte: serviceStart,
                                            lt: serviceEnd,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    select: {
                        id: true,
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

                // A sale must not contribute to multiple payroll weeks.
                const crossWeekCommissions = commissions.filter(
                    (item) =>
                        saleSpansPayrollWeeks(
                            item,
                            serviceStart,
                            serviceEnd
                        )
                );

                const crossWeekTips = tips.filter(
                    (item) =>
                        saleSpansPayrollWeeks(
                            item,
                            serviceStart,
                            serviceEnd
                        )
                );

                if (
                    crossWeekCommissions.length > 0 ||
                    crossWeekTips.length > 0
                ) {
                    throw new Error("CROSS_WEEK_PAYROLL_SALE");
                }

                // Never silently omit incorrectly attributed records.
                const invalidCommissions = commissions.filter(
                    (item) =>
                        !hasValidPayrollAttribution(
                            item,
                            serviceStart,
                            serviceEnd
                        ) ||
                        !["PENDING", "PAID"].includes(item.status)
                );

                const invalidTips = tips.filter(
                    (item) =>
                        !hasValidPayrollAttribution(
                            item,
                            serviceStart,
                            serviceEnd
                        ) ||
                        !["PENDING", "PAID"].includes(item.status)
                );

                if (
                    invalidCommissions.length > 0 ||
                    invalidTips.length > 0
                ) {
                    throw new Error("INVALID_PAYROLL_RECORDS");
                }
                
                const statements = employees.map((employee) => {
                    const entry = period?.entries.find(
                        (item) => item.employeeId === employee.id
                    );

                    const employeeCommissions = commissions.filter(
                        (item) =>
                            item.employeeId === employee.id &&
                            hasValidPayrollAttribution(
                                item,
                                serviceStart,
                                serviceEnd
                            )
                    );

                    const employeeTips = tips.filter(
                        (item) =>
                            item.employeeId === employee.id &&
                            hasValidPayrollAttribution(
                                item,
                                serviceStart,
                                serviceEnd
                            )
                    );

                    const summary = calculatePayrollDraftSummary({
                        employeeId: employee.id,
                        payrollEntryId: entry?.id ?? null,
                        commissions: employeeCommissions,
                        tips: employeeTips,
                        adjustments: entry?.adjustments ?? [],
                        historicalPayments:
                            entry?.historicalPayments ?? [],
                    });

                    return {
                        employeeId: employee.id,
                        employeeName: employee.name,
                        payrollEntryId: entry?.id ?? null,
                        action: entry
                            ? "UPDATE_DRAFT"
                            : "CREATE_DRAFT",
                        ...summary,
                    };
                });

                // Flag statements with conflicting assignments or overpayments
                const warnings = statements
                    .filter((item) => item.requiresReconciliation)
                    .map((item) => ({
                        employeeId: item.employeeId,
                        employeeName: item.employeeName,
                        remainingBalance: item.remainingBalance,
                        conflictingCommissions: item.conflictingCommissions,
                        conflictingTips: item.conflictingTips,
                        hasOverpayment: item.hasOverpayment,
                    }));


                return {
                    week,
                    endDate: addTeffDays(week, 6),
                    payday: addTeffDays(week, 7),
                    periodId: period?.id ?? null,
                    createCount: statements.filter(
                        (item) => item.action === "CREATE_DRAFT"
                    ).length,
                    updateCount: statements.filter(
                        (item) => item.action === "UPDATE_DRAFT"
                    ).length,
                    statements,
                    readyToWrite: false,
                    readOnly: true,
                    warnings,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            }
        );

        return Response.json(result);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "CROSS_WEEK_PAYROLL_SALE"
        ) {
            return Response.json(
                {
                    error:
                        "Existen ventas con servicios registrados en diferentes semanas de nómina.",
                    conflictType: "CROSS_WEEK_PAYROLL_SALE",
                },
                { status: 409 }
            );
        }
        
        if (
            error instanceof Error &&
            error.message === "INVALID_PAYROLL_RECORDS"
        ) {
            return Response.json(
                {
                    error:
                        "Existen comisiones o propinas con atribución o estado inválido.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "PAYROLL_LOCKED"
        ) {
            return Response.json(
                {
                    error:
                        "Esta nómina ya fue revisada, pagada o liquidada.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2034"
        ) {
            return Response.json(
                {
                    error:
                        "La nómina fue modificada simultáneamente. Inténtalo nuevamente.",
                },
                { status: 409 }
            );
        }

        console.error("Payroll draft preparation failed:", error);

        return Response.json(
            { error: "No se pudo preparar la nómina." },
            { status: 500 }
        );
    }
}