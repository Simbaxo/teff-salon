import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { calculateManualPaymentBalance } from "@/lib/payroll/manual-payments";
import { canSettleZeroBalance } from "@/lib/payroll/zero-balance-settlement";

// Only authenticated OWNER callers may initiate settlement.
export type SettleZeroBalanceOptions = {
    payrollEntryId: number;
    ownerId: number;
    database?: typeof prisma;
};


// Settle an already reconciled payroll statement.
// Database writes remain disabled until activation.
// Shared settlement transaction; write access stays private.
async function executeZeroBalanceSettlement({
    payrollEntryId,
    ownerId,
    database = prisma,
}: SettleZeroBalanceOptions, writeEnabled: boolean) {
const result = await database.$transaction(
            async (tx) => {
                // Recheck Owner authorization inside the settlement transaction.
                const authorizedOwner = await tx.user.findUnique({
                    where: { id: ownerId },
                    select: {
                        active: true,
                        role: true,
                    },
                });

                if (
                    !authorizedOwner ||
                    !authorizedOwner.active ||
                    authorizedOwner.role !== "OWNER"
                ) {
                    throw new Error("PAYROLL_OWNER_REQUIRED");
                }
                // Identify the week before obtaining its lock.
                const initialEntry =
                    await tx.payrollEntry.findUnique({
                        where: { id: payrollEntryId },
                        select: {
                            period: {
                                select: { startDate: true },
                            },
                        },
                    });

                if (!initialEntry) {
                    throw new Error("ENTRY_NOT_FOUND");
                }

                await lockPayrollWeek(
                    tx,
                    initialEntry.period.startDate
                );

                // Recheck financial data under the payroll-week lock.
                const entry =
                    await tx.payrollEntry.findUnique({
                        where: { id: payrollEntryId },
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

                const paidCommissions = entry.commissions
                    .filter((item) => item.status === "PAID")
                    .reduce(
                        (sum, item) =>
                            sum + item.commissionAmount,
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

                const eligible = canSettleZeroBalance({
                    entryStatus: entry.status,
                    periodStatus: entry.period.status,
                    remainingBalance: balance.remainingBalance,
                    hasOverpayment: balance.hasOverpayment,
                });

                // Reject settlement unless the statement is reviewed and fully reconciled.
                if (!eligible) {
                    throw new Error("ZERO_BALANCE_NOT_ELIGIBLE");
                }

                let settlementCompleted = false;

                if (writeEnabled && eligible) {
                    const settledAt = new Date();

                    // Settle this statement without creating a payment.
                    const updatedEntry =
                        await tx.payrollEntry.updateMany({
                            where: {
                                id: entry.id,
                                status: "REVIEWED",
                            },
                            data: {
                                status: "PAID",
                                paidAt: settledAt,
                            },
                        });

                    if (updatedEntry.count !== 1) {
                        throw new Error("PAYROLL_SETTLEMENT_CONFLICT");
                    }

                    // Check whether every statement is now settled.
                    const remainingEntries =
                        await tx.payrollEntry.count({
                            where: {
                                payrollPeriodId: entry.payrollPeriodId,
                                status: { not: "PAID" },
                            },
                        });

                    if (remainingEntries === 0) {
                        const updatedPeriod =
                            await tx.payrollPeriod.updateMany({
                                where: {
                                    id: entry.payrollPeriodId,
                                    status: "REVIEWED",
                                },
                                data: {
                                    status: "PAID",
                                    paidAt: settledAt,
                                },
                            });

                        if (updatedPeriod.count !== 1) {
                            throw new Error("PAYROLL_SETTLEMENT_CONFLICT");
                        }
                    }

                    settlementCompleted = true;
                }

                return {
                    payrollEntryId: entry.id,
                    periodId: entry.payrollPeriodId,
                    // Report PAID only after the settlement update succeeds.
                    currentStatus: settlementCompleted
                        ? "PAID"
                        : entry.status,
                    remainingBalance: balance.remainingBalance,
                    eligibleForSettlement: eligible,
                    readyToSettle: eligible && !settlementCompleted,
                    settlementCompleted,
                    readOnly: !settlementCompleted,
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

// Settle an already reconciled zero-balance payroll statement.
// Authorization and eligibility are verified inside the transaction.
export async function settleZeroBalance(
    options: SettleZeroBalanceOptions
) {
    return executeZeroBalanceSettlement(options, true);
}