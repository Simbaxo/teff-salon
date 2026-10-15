
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getPayrollOwner } from "@/lib/payroll/owner-auth";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { calculateManualPaymentBalance } from "@/lib/payroll/manual-payments";
import { canSettleZeroBalance } from "@/lib/payroll/zero-balance-settlement";

// Read-only preflight. No payroll status is changed.
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

    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        !("payrollEntryId" in body) ||
        !Number.isSafeInteger(body.payrollEntryId) ||
        Number(body.payrollEntryId) <= 0
    ) {
        return Response.json(
            { error: "Comprobante de nómina inválido." },
            { status: 400 }
        );
    }

    const payrollEntryId = Number(body.payrollEntryId);

    try {
        const result = await prisma.$transaction(
            async (tx) => {
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

                // Keep settlement disabled until integration testing.
                const writeEnabled = false;
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
                    currentStatus: entry.status,
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

        return Response.json(result);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "ZERO_BALANCE_NOT_ELIGIBLE"
        ) {
            return Response.json(
                {
                    error:
                        "Este comprobante no puede liquidarse porque no está revisado, tiene saldo pendiente o presenta un sobrepago.",
                    conflictType: "ZERO_BALANCE_NOT_ELIGIBLE",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "PAYROLL_SETTLEMENT_CONFLICT"
        ) {
            return Response.json(
                {
                    error:
                        "No se pudo liquidar el comprobante porque su estado cambió.",
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

        console.error("Zero-balance settlement failed:", error);

        return Response.json(
            { error: "No se pudo validar la liquidación." },
            { status: 500 }
        );
    }
}