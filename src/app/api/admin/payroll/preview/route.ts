
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
    calculateWeeklyPayrollSummary,
} from "@/lib/payroll/weekly-summary";
import {
    addTeffDays,
    getTeffDayOfWeek,
    getTeffToday,
} from "@/lib/datetime";

export async function GET(request: Request) {
    const session = await auth();

    // Payroll financial information is OWNER-only.
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

    try {
        const url = new URL(request.url);
        const requestedWeek = url.searchParams.get("week");

        const today = getTeffToday();
        const dayOfWeek = getTeffDayOfWeek(today);

        const daysSinceMonday =
            dayOfWeek === 0 ? 6 : dayOfWeek - 1;

        const currentMonday = addTeffDays(
            today,
            -daysSinceMonday
        );

        // Optional week parameter must be a valid Monday.
        let weekStartDate = currentMonday;

        if (requestedWeek !== null) {
            const validFormat =
                /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek);

            const parsed = validFormat
                ? new Date(`${requestedWeek}T00:00:00Z`)
                : null;

            const validDate =
                parsed !== null &&
                !Number.isNaN(parsed.getTime()) &&
                parsed.toISOString().slice(0, 10) ===
                    requestedWeek;

            if (
                !validDate ||
                getTeffDayOfWeek(requestedWeek) !== 1
            ) {
                return Response.json(
                    {
                        error:
                            "La semana debe comenzar un lunes válido.",
                    },
                    { status: 400 }
                );
            }

            weekStartDate = requestedWeek;
        }

        const weekEndDate = addTeffDays(
            weekStartDate,
            6
        );

        const nextMondayDate = addTeffDays(
            weekStartDate,
            7
        );

        const paydayDate = nextMondayDate;

        // Appointment.date is a calendar date stored at UTC midnight.
        const serviceStart = new Date(
            `${weekStartDate}T00:00:00.000Z`
        );

        const serviceEnd = new Date(
            `${nextMondayDate}T00:00:00.000Z`
        );

        // Load active technicians, including those with zero earnings.
        const employees = await prisma.employee.findMany({
            where: {
                OR: [
                    { active: true },
                    // Preserve technicians with an existing payroll statement.
                    {
                        payrollEntries: {
                            some: {
                                period: {
                                    startDate: serviceStart,
                                },
                            },
                        },
                    },

                    // Include inactive technicians who worked
                    // during the selected payroll period
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
            orderBy: {
                name: "asc",
            },
        });

        // Load commissions associated with services performed this week.
        const commissions = await prisma.commission.findMany({
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
                saleId: true,
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

        // Load tips associated with services performed this week.
        const tips = await prisma.tip.findMany({
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
                saleId: true,
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

        // A financial record belongs to this payroll week only
        // if its technician performed a service during that week.
        function workedThisWeek(
            employeeId: number,
            appointments: {
                appointment: {
                    employeeId: number;
                    date: Date;
                };
            }[]
        ) {
            return appointments.some(
                ({ appointment }) =>
                    appointment.employeeId === employeeId &&
                    appointment.date >= serviceStart &&
                    appointment.date < serviceEnd
            );
        }

        // Load existing payroll adjustments, if a draft exists.
        const existingPeriod =
            await prisma.payrollPeriod.findUnique({
                where: {
                    startDate: new Date(
                        `${weekStartDate}T00:00:00.000Z`
                    ),
                },
                include: {
                    entries: {
                        include: {
                            adjustments: true,
                        },
                    },
                },
            });

        const summaries = employees.map((employee) => {
            const employeeCommissions =
                commissions.filter(
                    (commission) =>
                        commission.employeeId === employee.id &&
                        workedThisWeek(
                            employee.id,
                            commission.sale.saleAppointments
                        )
                );

            const employeeTips = tips.filter(
                (tip) =>
                    tip.employeeId === employee.id &&
                    workedThisWeek(
                        employee.id,
                        tip.sale.saleAppointments
                    )
            );

            const existingEntry =
                existingPeriod?.entries.find(
                    (entry) =>
                        entry.employeeId === employee.id
                );

            // Include adjustment details for the payroll interface.
            const adjustments =
                existingEntry?.adjustments.map(
                    (adjustment) => ({
                        id: adjustment.id,
                        type: adjustment.type,
                        amount: adjustment.amount,
                        description: adjustment.description,
                    })
                ) ?? [];

            // Use the shared calculation for Preview and future Review.
            const weeklySummary = calculateWeeklyPayrollSummary({
                employeeId: employee.id,
                payrollEntryId: existingEntry?.id ?? null,
                commissions: employeeCommissions,
                tips: employeeTips,
                adjustments,
            });

            // Reviewed and paid payroll must retain approved totals
            // Draft payroll continues to use live calculations
            const isLocked =
            existingPeriod?.status === "REVIEWED" ||
            existingPeriod?.status === "PAID" ||
            existingEntry?.status === "REVIEWED" ||
            existingEntry?.status === "PAID";

            const displayedTotals =
            isLocked && existingEntry
                ? {
                        productionTotal: existingEntry.productionTotal,
                        commissionTotal: existingEntry.commissionTotal,
                        tipsTotal: existingEntry.tipsTotal,
                        bonusesTotal: existingEntry.bonusesTotal,
                        totalEarned: existingEntry.totalEarned,
                        loansTotal: existingEntry.loansTotal,
                        uniformsTotal: existingEntry.uniformsTotal,
                        otherDeductions: existingEntry.otherDeductions,
                        tipsAlreadyPaid: existingEntry.tipsAlreadyPaid,
                        netPay: existingEntry.netPay,
                    }
                : weeklySummary;

            // Snapshot totals remain frozen after review.
            // Outstanding amounts remain informational, not payment authorization.
            const outstandingPay =
                displayedTotals.netPay -
                weeklySummary.paidCommissions;

            return {
                employeeId: employee.id,
                employeeName: employee.name,
                adjustments,
                ...displayedTotals,
                paidCommissions: weeklySummary.paidCommissions,
                pendingCommissions: weeklySummary.pendingCommissions,
                outstandingPay,

                // Preserve the existing API field names for compatibility.
                assignedCommissionCount:
                    employeeCommissions.filter(
                        (item) => item.payrollEntryId !== null
                    ).length,

                assignedTipCount:
                    employeeTips.filter(
                        (item) => item.payrollEntryId !== null
                    ).length,

                payrollEntryId: existingEntry?.id ?? null,
                payrollStatus: existingEntry?.status ?? "DRAFT",

                conflictingCommissions:
                    weeklySummary.conflictingCommissions,

                conflictingTips:
                    weeklySummary.conflictingTips,

                requiresReview:
                    outstandingPay < 0 ||
                    weeklySummary.conflictingCommissions > 0 ||
                    weeklySummary.conflictingTips > 0,
            };
        });

        return Response.json({
            period: {
                id: existingPeriod?.id ?? null,
                status: existingPeriod?.status ?? "DRAFT",
                startDate: weekStartDate,
                endDate: weekEndDate,
                payday: paydayDate,
            },
            summaries,
            readOnly: true,
        });
    } catch (error) {
        console.error(
            "Failed to calculate payroll preview:",
            error
        );

        return Response.json(
            {
                error:
                    "No se pudo calcular la vista previa de nómina.",
            },
            { status: 500 }
        );
    }
}
