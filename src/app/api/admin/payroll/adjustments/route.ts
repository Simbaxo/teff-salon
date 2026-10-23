
import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addTeffDays } from "@/lib/datetime";
import { calculatePayroll } from "@/lib/payroll/calculations";
import { validatePayrollAdjustment } from "@/lib/payroll/adjustments";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";

export async function POST(request: Request) {
    const session = await auth();

    // Only the Owner can modify payroll.
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

    const validation = validatePayrollAdjustment(body);

    if (!validation.success) {
        return Response.json(
            { error: validation.error },
            { status: 400 }
        );
    }

    const {
        week,
        employeeId,
        type,
        amount,
        description,
    } = validation.data;

    const startDate = new Date(`${week}T00:00:00.000Z`);

    const endDate = new Date(
        `${addTeffDays(week, 6)}T00:00:00.000Z`
    );

    const payday = new Date(
        `${addTeffDays(week, 7)}T00:00:00.000Z`
    );

    try {
        const result = await prisma.$transaction(
            async (tx) => {

                // Serialize payroll adjustments with review and financial writes.
                await lockPayrollWeek(tx, startDate);
                
                // Ensure the technician exists and is active.
                const employee = await tx.employee.findUnique({
                    where: { id: employeeId },
                    select: {
                        id: true,
                        active: true,
                    },
                });

                if (!employee || !employee.active) {
                    throw new Error("INVALID_EMPLOYEE");
                }

                // Create the payroll period if it doesn't exist.
                const period = await tx.payrollPeriod.upsert({
                    where: { startDate },
                    update: {},
                    create: {
                        startDate,
                        endDate,
                        payday,
                        status: "DRAFT",
                    },
                });

                // Never modify a reviewed or paid period.
                if (period.status !== "DRAFT") {
                    throw new Error("PAYROLL_LOCKED");
                }

                // One payroll entry per technician per week.
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

                // Save the new adjustment.
                const adjustment =
                    await tx.payrollAdjustment.create({
                        data: {
                            payrollEntryId: entry.id,
                            type,
                            amount,
                            description,
                        },
                    });

                // Load all adjustments for this statement.
                const adjustments =
                    await tx.payrollAdjustment.findMany({
                        where: {
                            payrollEntryId: entry.id,
                        },
                        select: {
                            type: true,
                            amount: true,
                        },
                    });

                // Service dates are stored as UTC calendar dates.
                const serviceEnd = new Date(
                    `${addTeffDays(week, 7)}T00:00:00.000Z`
                );

                const commissions =
                    await tx.commission.findMany({
                        where: {
                            employeeId,
                            sale: {
                                saleAppointments: {
                                    some: {
                                        appointment: {
                                            employeeId,
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
                            commissionBase: true,
                            commissionAmount: true,
                        },
                    });

                const tips = await tx.tip.findMany({
                    where: {
                        employeeId,
                        sale: {
                            saleAppointments: {
                                some: {
                                    appointment: {
                                        employeeId,
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
                        amount: true,
                        status: true,
                    },
                });

                // Recalculate the complete draft statement.
                const totals = calculatePayroll({
                    salaryTotal: entry.salaryTotal,
                    commissions,
                    tips,
                    adjustments,
                });

                await tx.payrollEntry.update({
                    where: { id: entry.id },
                    data: totals,
                });

                return {
                    adjustment,
                    payrollEntryId: entry.id,
                    periodId: period.id,
                    totals,
                }

            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            }
        );

        return Response.json(
            {
                success: true,
                ...result,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error(
            "Failed to create payroll adjustment:",
            error
        );

        // A concurrent payroll transaction may need to be retried.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2034"
        ) {
            return Response.json(
                {
                    error:
                        "La nómina fue modificada al mismo tiempo. Actualiza la página e inténtalo nuevamente.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "INVALID_EMPLOYEE"
        ) {
            return Response.json(
                { error: "Técnica inválida o inactiva." },
                { status: 400 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "PAYROLL_LOCKED"
        ) {
            return Response.json(
                {
                    error:
                        "Esta nómina ya fue revisada o pagada.",
                },
                { status: 409 }
            );
        }

        return Response.json(
            {
                error:
                    "No se pudo guardar el ajuste de nómina.",
            },
            { status: 500 }
        );
    }
}
