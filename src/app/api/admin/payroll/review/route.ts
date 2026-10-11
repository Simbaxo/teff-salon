
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
    getTeffDayOfWeek,
    addTeffDays,
} from "@/lib/datetime";
import {
    calculateWeeklyPayrollSummary,
} from "@/lib/payroll/weekly-summary";

// Read-only preflight. Does not review or pay payroll.
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
        !("week" in body) ||
        typeof body.week !== "string"
    ) {
        return Response.json(
            { error: "Semana inválida." },
            { status: 400 }
        );
    }

    const week = body.week;

    // Validate a real Monday in YYYY-MM-DD format.
    const validFormat = /^\d{4}-\d{2}-\d{2}$/.test(week);

    const parsed = validFormat
        ? new Date(`${week}T00:00:00.000Z`)
        : null;

    if (
        !parsed ||
        Number.isNaN(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== week ||
        getTeffDayOfWeek(week) !== 1
    ) {
        return Response.json(
            { error: "La semana debe comenzar un lunes válido." },
            { status: 400 }
        );
    }

    const serviceStart = parsed;
    const serviceEnd = new Date(
        `${addTeffDays(week, 7)}T00:00:00.000Z`
    );

    try {
        const period = await prisma.payrollPeriod.findUnique({
            where: {
                startDate: serviceStart,
            },
            include: {
                entries: {
                    include: {
                        adjustments: true,
                    },
                },
            },
        });

        if (period && period.status !== "DRAFT") {
            return Response.json(
                {
                    error: "Esta nómina ya fue revisada o pagada.",
                },
                { status: 409 }
            );
        }

        // Load all financial records associated with this service week.
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

        // Verify that the technician worked during this period.
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

        const employeeIds = new Set<number>();

        // Include active technicians and existing payroll entries.
        const employees = await prisma.employee.findMany({
            where: {
                active: true,
            },
            select: {
                id: true,
                name: true,
            },
        });

        for (const employee of employees) {
            employeeIds.add(employee.id);
        }

        for (const entry of period?.entries ?? []) {
            employeeIds.add(entry.employeeId);
        }

        for (const commission of commissions) {
            employeeIds.add(commission.employeeId);
        }

        for (const tip of tips) {
            employeeIds.add(tip.employeeId);
        }

        const names = await prisma.employee.findMany({
            where: {
                id: {
                    in: Array.from(employeeIds),
                },
            },
            select: {
                id: true,
                name: true,
            },
        });

        const employeeNames = new Map(
            names.map((employee) => [
                employee.id,
                employee.name,
            ])
        );

        const summaries = Array.from(employeeIds).map(
            (employeeId) => {
                const entry = period?.entries.find(
                    (item) => item.employeeId === employeeId
                );

                const employeeCommissions = commissions.filter(
                    (item) =>
                        item.employeeId === employeeId &&
                        workedThisWeek(
                            employeeId,
                            item.sale.saleAppointments
                        )
                );

                const employeeTips = tips.filter(
                    (item) =>
                        item.employeeId === employeeId &&
                        workedThisWeek(
                            employeeId,
                            item.sale.saleAppointments
                        )
                );

                const summary = calculateWeeklyPayrollSummary({
                    employeeId,
                    payrollEntryId: entry?.id ?? null,
                    commissions: employeeCommissions,
                    tips: employeeTips,
                    adjustments: entry?.adjustments ?? [],
                });

                return {
                    employeeId,
                    employeeName:
                        employeeNames.get(employeeId) ?? "Técnica",
                    ...summary,
                };
            }
        );

        const warnings = summaries
            .filter((item) => item.requiresReview)
            .map((item) => ({
                employeeId: item.employeeId,
                employeeName: item.employeeName,
                outstandingPay: item.outstandingPay,
                conflictingCommissions:
                    item.conflictingCommissions,
                conflictingTips: item.conflictingTips,
            }));

        return Response.json({
            week,
            endDate: addTeffDays(week, 6),
            payday: addTeffDays(week, 7),
            readyForReview: warnings.length === 0,
            warnings,
            summaries,
            readOnly: true,
        });
    } catch (error) {
        console.error(
            "Payroll review preflight failed:",
            error
        );

        return Response.json(
            {
                error: "No se pudo validar la nómina.",
            },
            { status: 500 }
        );
    }
}
