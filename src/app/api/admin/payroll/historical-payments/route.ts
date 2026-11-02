
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { validateHistoricalPayment } from "@/lib/payroll/historical-payment-validation";
import { calculatePayrollReconciliation } from "@/lib/payroll/reconciliation";
import { addTeffDays } from "@/lib/datetime";
import {
    saleSpansPayrollWeeks,
    hasValidCommissionPayrollAttribution,
} from "@/lib/payroll/review-validation";

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

                // Check whether this recording request was already processed.
                const existingPayment =
                    await tx.payrollHistoricalPayment.findUnique({
                        where: {
                            idempotencyKey: input.idempotencyKey,
                        },
                    });

                // A reused key must refer to the exact same payment.
                if (existingPayment) {
                    const samePayment =
                        existingPayment.payrollEntryId === input.payrollEntryId &&
                        existingPayment.amount === input.amount &&
                        existingPayment.paymentDate
                            .toISOString()
                            .slice(0, 10) === input.paymentDate &&
                        existingPayment.paymentMethod === input.paymentMethod &&
                        existingPayment.description === input.description &&
                        existingPayment.paymentReference === input.paymentReference;

                    if (!samePayment) {
                        throw new Error("IDEMPOTENCY_CONFLICT");
                    }

                    // The original request has already been recorded.
                    // Do not subtract or create the payment again.
                    return {
                        payrollEntryId: currentEntry.id,
                        existingPaymentId: existingPayment.id,
                        alreadyRecorded: true,
                        readyToRecord: false,
                        readOnly: true,
                    };
                }

                // A receipt reference should not be reused for another
                // historical payment within the same payroll entry.
                const duplicateReference =
                    input.paymentReference
                        ? await tx.payrollHistoricalPayment.findFirst({
                            where: {
                                payrollEntryId: input.payrollEntryId,
                                paymentReference: input.paymentReference,
                            },
                            select: {
                                id: true,
                            },
                        })
                        : null;

                if (duplicateReference) {
                    throw new Error("DUPLICATE_PAYMENT_REFERENCE");
                }

                if (
                    currentEntry.period.reconciliationStatus === "SETTLED" ||
                    currentEntry.period.status === "PAID" ||
                    currentEntry.status === "PAID"
                ) {
                    throw new Error("RECONCILIATION_LOCKED");
                }


                // Use the technician's service week, not only
                // commissions already linked to a payroll entry.
                const serviceStart =
                    currentEntry.period.startDate;

                const week = serviceStart
                    .toISOString()
                    .slice(0, 10);

                const serviceEnd = new Date(
                    `${addTeffDays(week, 7)}T00:00:00.000Z`
                );

                const weeklyCommissions =
                    await tx.commission.findMany({
                        where: {
                            employeeId: currentEntry.employeeId,
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

                // Reject financial records with invalid attribution,
                // conflicting payroll assignments, or cross-week sales.
                const invalidWeeklyCommissions =
                    weeklyCommissions.filter(
                        (commission) =>
                            !hasValidCommissionPayrollAttribution(
                                commission,
                                serviceStart,
                                serviceEnd
                            ) ||
                            saleSpansPayrollWeeks(
                                commission,
                                serviceStart,
                                serviceEnd
                            ) ||
                            !["PENDING", "PAID"].includes(
                                commission.status
                            ) ||
                            (
                                commission.payrollEntryId !== null &&
                                commission.payrollEntryId !==
                                    currentEntry.id
                            )
                    );

                if (invalidWeeklyCommissions.length > 0) {
                    throw new Error(
                        "INVALID_HISTORICAL_COMMISSIONS"
                    );
                }

                // Count commissions already marked PAID,
                // even if draft preparation has not linked them yet.
                const paidCommissions = weeklyCommissions
                    .filter((commission) => commission.status === "PAID")
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
                    alreadyRecorded: false,
                    proposedPayment: {
                        amount: input.amount,
                        paymentDate: input.paymentDate,
                        paymentMethod: input.paymentMethod,
                        description: input.description,
                        idempotencyKey: input.idempotencyKey,
                        paymentReference: input.paymentReference,
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
            error.message === "IDEMPOTENCY_CONFLICT"
        ) {
            return Response.json(
                {
                    error:
                        "Esta clave de pago ya fue utilizada para registrar un pago diferente.",
                    conflictType: "IDEMPOTENCY_CONFLICT",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "DUPLICATE_PAYMENT_REFERENCE"
        ) {
            return Response.json(
                {
                    error:
                        "Ya existe un pago histórico con esta referencia para el mismo comprobante.",
                    conflictType: "DUPLICATE_PAYMENT_REFERENCE",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "INVALID_HISTORICAL_COMMISSIONS"
        ) {
            return Response.json(
                {
                    error:
                        "Existen comisiones históricas con atribución o asignación inválida.",
                },
                { status: 409 }
            );
        }

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