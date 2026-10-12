
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { validateHistoricalPayment } from "@/lib/payroll/historical-payment-validation";
import { calculatePayrollReconciliation } from "@/lib/payroll/reconciliation";

// Read-only validation. No historical payment is created.
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

    const validation = validateHistoricalPayment(body);

    if (!validation.success) {
        return Response.json(
            { error: validation.error },
            { status: 400 }
        );
    }

    const input = validation.data;

    try {
        const result = await prisma.$transaction(
            async (tx) => {
                // Find the payroll entry to identify its week.
                const entry = await tx.payrollEntry.findUnique({
                    where: {
                        id: input.payrollEntryId,
                    },
                    include: {
                        period: true,
                        historicalPayments: true,
                        commissions: {
                            select: {
                                commissionAmount: true,
                                status: true,
                            },
                        },
                    },
                });

                if (!entry) {
                    throw new Error("ENTRY_NOT_FOUND");
                }

                // Coordinate reconciliation with other payroll changes.
                await lockPayrollWeek(
                    tx,
                    entry.period.startDate
                );

                // Read again after acquiring the lock.
                const currentEntry = await tx.payrollEntry.findUnique({
                    where: { id: entry.id },
                    include: {
                        period: true,
                        historicalPayments: true,
                        commissions: {
                            select: {
                                commissionAmount: true,
                                status: true,
                            },
                        },
                    },
                });

                if (!currentEntry) {
                    throw new Error("ENTRY_NOT_FOUND");
                }

                if (
                    currentEntry.period.reconciliationStatus === "SETTLED" ||
                    currentEntry.period.status === "PAID" ||
                    currentEntry.status === "PAID"
                ) {
                    throw new Error("RECONCILIATION_LOCKED");
                }

                const paidCommissions =
                    currentEntry.commissions
                        .filter(
                            (commission) =>
                                commission.status === "PAID"
                        )
                        .reduce(
                            (sum, commission) =>
                                sum + commission.commissionAmount,
                            0
                        );

                const reconciliation =
                    calculatePayrollReconciliation({
                        netPay: currentEntry.netPay,
                        paidCommissions,
                        historicalPayments:
                            currentEntry.historicalPayments,
                    });

                // Check the proposed amount without saving it.
                const projectedRemainingBalance =
                    reconciliation.remainingBalance -
                    input.amount;

                return {
                    payrollEntryId: currentEntry.id,
                    employeeId: currentEntry.employeeId,
                    periodId: currentEntry.payrollPeriodId,
                    reconciliation,
                    proposedPayment: {
                        amount: input.amount,
                        paymentDate: input.paymentDate,
                        paymentMethod: input.paymentMethod,
                        description: input.description,
                    },
                    projectedRemainingBalance,
                    amountWithinBalance:
                        reconciliation.remainingBalance > 0 &&
                        projectedRemainingBalance >= 0,
                    readyToRecord: false,
                    readOnly: true,
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
            error.message === "ENTRY_NOT_FOUND"
        ) {
            return Response.json(
                { error: "Comprobante de nómina no encontrado." },
                { status: 404 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "RECONCILIATION_LOCKED"
        ) {
            return Response.json(
                {
                    error:
                        "La conciliación de esta nómina está cerrada.",
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
                        "La nómina fue modificada al mismo tiempo. Actualiza e inténtalo nuevamente.",
                },
                { status: 409 }
            );
        }

        console.error(
            "Historical payroll payment validation failed:",
            error
        );

        return Response.json(
            {
                error:
                    "No se pudo validar el pago histórico.",
            },
            { status: 500 }
        );
    }
}