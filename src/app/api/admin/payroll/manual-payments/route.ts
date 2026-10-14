
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getPayrollOwner } from "@/lib/payroll/owner-auth";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { validateManualPayment } from "@/lib/payroll/manual-payment-validation";
import { calculateManualPaymentBalance } from "@/lib/payroll/manual-payments";
import {
    isSameManualPayment,
} from "@/lib/payroll/manual-payment-idempotency";

// Validation only. No payment records are created.
export async function POST(request: Request) {
    const owner = await getPayrollOwner();

    if (!owner.success) {
        return Response.json(
            { error: owner.error },
            { status: owner.status }
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

    const validation = validateManualPayment(body);

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
                // Find the payroll week before acquiring its lock.
                const initialEntry =
                    await tx.payrollEntry.findUnique({
                        where: {
                            id: input.payrollEntryId,
                        },
                        select: {
                            id: true,
                            period: {
                                select: {
                                    startDate: true,
                                },
                            },
                        },
                    });

                if (!initialEntry) {
                    throw new Error("ENTRY_NOT_FOUND");
                }

                // Serialize payment operations for this week.
                await lockPayrollWeek(
                    tx,
                    initialEntry.period.startDate
                );

                // Reload financial data after acquiring the lock.
                const entry =
                    await tx.payrollEntry.findUnique({
                        where: {
                            id: input.payrollEntryId,
                        },
                        include: {
                            period: true,
                            commissions: {
                                select: {
                                    commissionAmount: true,
                                    status: true,
                                },
                            },
                            historicalPayments: true,
                            manualPayments: true,
                        },
                    });

                if (!entry) {
                    throw new Error("ENTRY_NOT_FOUND");
                }


                // Check idempotency before rejecting settled payroll.
                // A successful payment must be safe to retry.
                const existingPayment =
                    await tx.payrollManualPayment.findUnique({
                        where: {
                            idempotencyKey: input.idempotencyKey,
                        },
                    });

                if (existingPayment) {
                    
                    // Compare the original payment against this retry.
                    const samePayment = isSameManualPayment(
                        {
                            payrollEntryId:
                                existingPayment.payrollEntryId,
                            amount: existingPayment.amount,
                            paymentDate:
                                existingPayment.paymentDate
                                    .toISOString()
                                    .slice(0, 10),
                            paymentMethod:
                                existingPayment.paymentMethod,
                            paymentReference:
                                existingPayment.paymentReference,
                            description:
                                existingPayment.description,
                            recordedByUserId:
                                existingPayment.recordedByUserId,
                        },
                        {
                            payrollEntryId: input.payrollEntryId,
                            amount: input.amount,
                            paymentDate: input.paymentDate,
                            paymentMethod: input.paymentMethod,
                            paymentReference:
                                input.paymentReference,
                            description: input.description,
                            recordedByUserId: owner.ownerId,
                        }
                    );

                    if (!samePayment) {
                        throw new Error("IDEMPOTENCY_CONFLICT");
                    }

                    // Return the original record without creating another.
                    return {
                        payrollEntryId: entry.id,
                        existingPaymentId: existingPayment.id,
                        alreadyRecorded: true,
                        readyToRecord: false,
                        readOnly: true,
                    };
                }

                // Only approved statements may receive payments.
                if (
                    entry.status !== "REVIEWED" ||
                    entry.period.status !== "REVIEWED"
                ) {
                    throw new Error("PAYROLL_NOT_REVIEWED");
                }

                // Prevent reuse of a receipt reference for this statement.
                if (input.paymentReference) {
                    const duplicateReference =
                        await tx.payrollManualPayment.findFirst({
                            where: {
                                payrollEntryId: entry.id,
                                paymentReference:
                                    input.paymentReference,
                            },
                            select: {
                                id: true,
                            },
                        });

                    if (duplicateReference) {
                        throw new Error(
                            "DUPLICATE_PAYMENT_REFERENCE"
                        );
                    }
                }

                // Commissions already delivered are not payable again.
                const paidCommissions = entry.commissions
                    .filter(
                        (commission) =>
                            commission.status === "PAID"
                    )
                    .reduce(
                        (sum, commission) =>
                            sum + commission.commissionAmount,
                        0
                    );

                const balance =
                    calculateManualPaymentBalance({
                        netPay: entry.netPay,
                        paidCommissions,
                        historicalPayments:
                            entry.historicalPayments,
                        manualPayments:
                            entry.manualPayments,
                    });

                const projectedRemainingBalance =
                    balance.remainingBalance - input.amount;

                // Never record payments exceeding the outstanding balance.
                if (
                    balance.hasOverpayment ||
                    balance.remainingBalance <= 0 ||
                    projectedRemainingBalance < 0
                ) {
                    throw new Error("INVALID_PAYMENT_BALANCE");
                }


                // Payment recording remains disabled until
                // the complete settlement workflow is tested.
                const writeEnabled = false;

                let recordedPaymentId: number | null = null;

                if (writeEnabled) {
                    // Record money the Owner already delivered.
                    // TEFF does not initiate bank transfers.
                    const payment =
                        await tx.payrollManualPayment.create({
                            data: {
                                payrollEntryId: entry.id,
                                amount: input.amount,
                                paymentDate: new Date(
                                    `${input.paymentDate}T00:00:00.000Z`
                                ),
                                paymentMethod: input.paymentMethod,
                                idempotencyKey: input.idempotencyKey,
                                paymentReference: input.paymentReference,
                                description: input.description,
                                recordedByUserId: owner.ownerId,
                            },
                        });

                    recordedPaymentId = payment.id;

                    // Fully settle the technician only when nothing remains owed.
                    if (projectedRemainingBalance === 0) {
                        const updatedEntry = await tx.payrollEntry.updateMany({
                            where: {
                                id: entry.id,
                                status: "REVIEWED",
                            },
                            data: {
                                status: "PAID",
                                paidAt: new Date(),
                            },
                        });

                        // A conflict rolls back the payment insertion too.
                        if (updatedEntry.count !== 1) {
                            throw new Error("PAYROLL_SETTLEMENT_CONFLICT");
                        }
                    }


                    // Check every statement after recording this payment.
                    // The period is paid only when all entries are settled.
                    const periodEntries =
                        await tx.payrollEntry.findMany({
                            where: {
                                payrollPeriodId: entry.payrollPeriodId,
                            },
                            select: {
                                id: true,
                                status: true,
                                netPay: true,
                            },
                        });

                    // Zero-value statements must be settled explicitly.
                    // Do not create fictitious payments for them.
                    const allEntriesPaid =
                        periodEntries.length > 0 &&
                        periodEntries.every(
                            (item) => item.status === "PAID"
                        );

                    if (allEntriesPaid) {
                        const updatedPeriod =
                            await tx.payrollPeriod.updateMany({
                                where: {
                                    id: entry.payrollPeriodId,
                                    status: "REVIEWED",
                                },
                                data: {
                                    status: "PAID",
                                    paidAt: new Date(),
                                },
                            });

                        if (updatedPeriod.count !== 1) {
                            throw new Error(
                                "PAYROLL_SETTLEMENT_CONFLICT"
                            );
                        }
                    }
                }

                return {
                    payrollEntryId: entry.id,
                    periodId: entry.payrollPeriodId,
                    ownerId: owner.ownerId,
                    payrollStatus: entry.status,
                    currentBalance: balance.remainingBalance,
                    proposedPayment: {
                        amount: input.amount,
                        paymentDate: input.paymentDate,
                        paymentMethod: input.paymentMethod,
                        paymentReference: input.paymentReference,
                        description: input.description,
                    },
                    projectedRemainingBalance,
                    amountWithinBalance:
                        !balance.hasOverpayment &&
                        balance.remainingBalance > 0 &&
                        projectedRemainingBalance >= 0,
                    wouldSettleEntry:
                        projectedRemainingBalance === 0 &&
                        !balance.hasOverpayment,
                    readyToRecord: true,
                    readOnly: !writeEnabled,
                    recordedPaymentId,
                    paymentRecorded: recordedPaymentId !== null,
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
            error.message === "PAYROLL_SETTLEMENT_CONFLICT"
        ) {
            return Response.json(
                {
                    error:
                        "No se pudo liquidar la nómina porque su estado cambió.",
                    conflictType: "PAYROLL_SETTLEMENT_CONFLICT",
                },
                { status: 409 }
            );
        }

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
            error.message === "INVALID_PAYMENT_BALANCE"
        ) {
            return Response.json(
                {
                    error:
                        "El monto supera el saldo pendiente o la nómina ya está liquidada.",
                    conflictType: "INVALID_PAYMENT_BALANCE",
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
            error.message === "PAYROLL_NOT_REVIEWED"
        ) {
            return Response.json(
                {
                    error:
                        "Solo se pueden registrar pagos en nóminas revisadas.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            [
                "DUPLICATE_PAYMENT_KEY",
                "DUPLICATE_PAYMENT_REFERENCE",
            ].includes(error.message)
        ) {
            return Response.json(
                {
                    error:
                        "Este pago o su referencia ya existe.",
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

        console.error("Manual payroll validation failed:", error);

        return Response.json(
            {
                error:
                    "No se pudo validar el pago manual.",
            },
            { status: 500 }
        );
    }
}