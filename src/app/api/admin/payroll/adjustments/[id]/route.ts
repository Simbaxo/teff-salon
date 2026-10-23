
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { calculatePayroll } from "@/lib/payroll/calculations";
import { addTeffDays } from "@/lib/datetime";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";

export async function DELETE(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const session = await auth();

    // Only the Owner may remove payroll adjustments.
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

    const { id } = await context.params;
    const adjustmentId = Number(id);

    if (
        !Number.isSafeInteger(adjustmentId) ||
        adjustmentId <= 0
    ) {
        return Response.json(
            { error: "Ajuste inválido." },
            { status: 400 }
        );
    }

    try {
        const result = await prisma.$transaction(
            async (tx) => {
                
                // First lookup: identify which payroll week owns the adjustment.
                const initialAdjustment =
                    await tx.payrollAdjustment.findUnique({
                        where: { id: adjustmentId },
                        include: {
                            entry: {
                                include: {
                                    period: true,
                                },
                            },
                        },
                    });

                if (!initialAdjustment) {
                    throw new Error("ADJUSTMENT_NOT_FOUND");
                }

                // Serialize deletion with payroll review and other changes.
                await lockPayrollWeek(
                    tx,
                    initialAdjustment.entry.period.startDate
                );

                // Re-read after acquiring the lock to avoid stale data.
                const adjustment =
                    await tx.payrollAdjustment.findUnique({
                        where: { id: adjustmentId },
                        include: {
                            entry: {
                                include: {
                                    period: true,
                                },
                            },
                        },
                    });

                if (!adjustment) {
                    throw new Error("ADJUSTMENT_NOT_FOUND");
                }

                const entry = adjustment.entry;

                // Both the period and statement must remain drafts.
                if (
                    entry.status !== "DRAFT" ||
                    entry.period.status !== "DRAFT"
                ) {
                    throw new Error("PAYROLL_LOCKED");
                }
                
                await tx.payrollAdjustment.delete({
                    where: { id: adjustmentId },
                });

                const remainingAdjustments =
                    await tx.payrollAdjustment.findMany({
                        where: {
                            payrollEntryId: entry.id,
                        },
                        select: {
                            type: true,
                            amount: true,
                        },
                    });

                const week =
                    entry.period.startDate
                        .toISOString()
                        .slice(0, 10);

                const serviceStart =
                    entry.period.startDate;

                const serviceEnd = new Date(
                    `${addTeffDays(week, 7)}T00:00:00.000Z`
                );

                // Recalculate using the actual service week.
                const commissions =
                    await tx.commission.findMany({
                        where: {
                            employeeId: entry.employeeId,
                            sale: {
                                saleAppointments: {
                                    some: {
                                        appointment: {
                                            employeeId: entry.employeeId,
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
                            commissionBase: true,
                            commissionAmount: true,
                        },
                    });

                
                const tips = await tx.tip.findMany({
                    where: {
                        employeeId: entry.employeeId,
                        sale: {
                            saleAppointments: {
                                some: {
                                    appointment: {
                                        employeeId: entry.employeeId,
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
                        amount: true,
                        status: true,
                    },
                });

                const totals = calculatePayroll({
                    salaryTotal: entry.salaryTotal,
                    commissions,
                    tips,
                    adjustments: remainingAdjustments,
                });

                await tx.payrollEntry.update({
                    where: { id: entry.id },
                    data: totals,
                });

                return {
                    payrollEntryId: entry.id,
                    totals,
                };
            },
            {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            }
        );

        return Response.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error(
            "Failed to delete payroll adjustment:",
            error
        );

        // Prevent a concurrent transaction conflict from appearing as a server error.
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
            error.message === "ADJUSTMENT_NOT_FOUND"
        ) {
            return Response.json(
                { error: "Ajuste no encontrado." },
                { status: 404 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "PAYROLL_LOCKED"
        ) {
            return Response.json(
                {
                    error:
                        "No se pueden modificar ajustes de una nómina revisada o pagada.",
                },
                { status: 409 }
            );
        }

        return Response.json(
            {
                error:
                    "No se pudo eliminar el ajuste.",
            },
            { status: 500 }
        );
    }
}
