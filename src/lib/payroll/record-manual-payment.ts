import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { calculateManualPaymentBalance } from "@/lib/payroll/manual-payments";
import { isSameManualPayment } from "@/lib/payroll/manual-payment-idempotency";

import type { ManualPaymentInput } from "@/lib/payroll/manual-payment-validation";

// The API authenticates the Owner before calling this function.
// The Owner ID must never come from the request body.
export type RecordManualPaymentOptions = {
    input: ManualPaymentInput;
    ownerId: number;
    database?: typeof prisma;
};

// Internal transaction logic shared by validation and recording.
async function executeManualPayment({
    input,
    ownerId,
    database = prisma,
}: RecordManualPaymentOptions, writeEnabled: boolean) {
        const result = await database.$transaction(
            async (tx) => {
                // Independently verify the Owner before any financial operation.
                const authorizedOwner = await tx.user.findUnique({
                    where: { id: ownerId },
                    select: {
                        id: true,
                        role: true,
                        active: true,
                    },
                });

                if (
                    !authorizedOwner ||
                    !authorizedOwner.active ||
                    authorizedOwner.role !== "OWNER"
                ) {
                    throw new Error("PAYROLL_OWNER_REQUIRED");
                }
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
                            recordedByUserId: ownerId,
                        }
                    );

                    if (!samePayment) {
                        throw new Error("IDEMPOTENCY_CONFLICT");
                    }

                    // An identical retry confirms the payment already exists.
                    return {
                        payrollEntryId: entry.id,
                        existingPaymentId: existingPayment.id,
                        alreadyRecorded: true,
                        paymentRecorded: true,
                        readyToRecord: false,
                        readOnly: false,
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

                // Reject invalid balances and prevent overpayment
                if (
                    balance.hasOverpayment ||
                    balance.remainingBalance <= 0 ||
                    projectedRemainingBalance < 0
                ) {
                    throw new Error("INVALID_PAYMENT_BALANCE");
                }

                // Full-payment confirmation must match the server balance.
                if (projectedRemainingBalance !== 0) {
                    throw new Error("PAYROLL_BALANCE_CHANGED");
                }


                // Payment recording remains disabled until
                // the complete settlement workflow is tested.


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
                                recordedByUserId: ownerId,
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
                    ownerId: ownerId,
                    // Report PAID only when this transaction actually settles the entry.
                    payrollStatus:
                        recordedPaymentId !== null &&
                        projectedRemainingBalance === 0
                            ? "PAID"
                            : entry.status,
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

    return result;
}

// Record a payment already delivered by the Owner.
// Authorization and balance checks run inside the transaction.
export async function recordManualPayment(
    options: RecordManualPaymentOptions
) {
    return executeManualPayment(options, true);
}