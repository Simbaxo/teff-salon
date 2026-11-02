
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { addTeffDays } from "@/lib/datetime";

/**
 * Read the financial records belonging to a Monday–Sunday
 * service week and generate a deterministic fingerprint.
 *
 * This helper does not modify the database.
 *
 * The caller must validate the week and coordinate
 * concurrent financial writes before saving a review.
 */
export async function getWeeklySalesSnapshot(
    tx: Prisma.TransactionClient,
    week: string
) {
    const start = new Date(`${week}T00:00:00.000Z`);
    const nextMonday = addTeffDays(week, 7);
    const end = new Date(`${nextMonday}T00:00:00.000Z`);

    const sales = await tx.sale.findMany({
        where: {
            saleAppointments: {
                some: {
                    appointment: {
                        date: {
                            gte: start,
                            lt: end,
                        },
                    },
                },
            },
        },
        select: {
            id: true,
            createdAt: true,
            subtotal: true,
            discountTotal: true,
            finalTotal: true,

            lineItems: {
                orderBy: { id: "asc" },
                select: {
                    id: true,
                    itemType: true,
                    itemId: true,
                    itemName: true,
                    unitPrice: true,
                    employeeId: true,
                    appointmentId: true,
                    parentLineItemId: true,
                },
            },

            payments: {
                orderBy: { id: "asc" },
                select: {
                    id: true,
                    paymentMethod: true,
                    amount: true,
                    processingFee: true,
                },
            },

            commissions: {
                orderBy: { id: "asc" },
                select: {
                    id: true,
                    employeeId: true,
                    commissionBase: true,
                },
            },

            tips: {
                orderBy: { id: "asc" },
                select: {
                    id: true,
                    employeeId: true,
                    amount: true,
                    paymentMethod: true,
                },
            },

            saleAppointments: {
                orderBy: { appointmentId: "asc" },
                select: {
                    appointmentId: true,
                    appointment: {
                        select: {
                            date: true,
                            employeeId: true,
                            startTime: true,
                        },
                    },
                },
            },
        },
        orderBy: { id: "asc" },
    });

    // Verify every sale before allowing weekly confirmation.
    const issues: {
        saleId: number;
        codes: string[];
    }[] = [];

    for (const sale of sales) {
        const codes: string[] = [];

        const crossWeek = sale.saleAppointments.some(
            ({ appointment }) =>
                appointment.date < start ||
                appointment.date >= end
        );

        if (crossWeek) {
            codes.push("VENTA_ENTRE_SEMANAS");
        }

        if (sale.commissions.length === 0) {
            codes.push("SIN_ASIGNACION_PRODUCCION");
        }

        const attributedCount = sale.lineItems.filter(
            (item) => item.employeeId !== null
        ).length;

        if (
            sale.lineItems.length === 0 ||
            (
                attributedCount > 0 &&
                attributedCount !== sale.lineItems.length
            )
        ) {
            codes.push("ATRIBUCION_INCOMPLETA");
        }

        const productionTotal = sale.commissions.reduce(
            (total, commission) =>
                total + commission.commissionBase,
            0
        );

        if (productionTotal !== sale.finalTotal) {
            codes.push("PRODUCCION_NO_CONCILIA");
        }

        if (attributedCount === sale.lineItems.length) {
            const technicianIds = new Set(
                sale.commissions.map(
                    (commission) => commission.employeeId
                )
            );

            if (
                sale.lineItems.some(
                    (item) =>
                        item.employeeId !== null &&
                        !technicianIds.has(item.employeeId)
                )
            ) {
                codes.push("TECNICA_SIN_PRODUCCION");
            }
        }

        // Reconcile recorded payments against the sale
        // and tips collected electronically.
        // Cash tips are paid directly to technicians.
        const paymentTotal = sale.payments.reduce(
            (total, payment) => total + payment.amount,
            0
        );

        const electronicTipTotal = sale.tips
            .filter((tip) => tip.paymentMethod !== "CASH")
            .reduce(
                (total, tip) => total + tip.amount,
                0
            );

        const expectedPaymentTotal =
            sale.finalTotal + electronicTipTotal;

        if (
            !Number.isSafeInteger(paymentTotal) ||
            !Number.isSafeInteger(expectedPaymentTotal) ||
            paymentTotal !== expectedPaymentTotal
        ) {
            codes.push("PAGOS_NO_CONCILIAN");
        }

        // Payment processing fees are recorded separately.
        // They are not part of the sale revenue or this
        // payment reconciliation.
        if (
            sale.payments.some(
                (payment) =>
                    !Number.isSafeInteger(payment.amount) ||
                    payment.amount < 0 ||
                    !Number.isSafeInteger(payment.processingFee) ||
                    payment.processingFee < 0
            )
        ) {
            codes.push("PAGO_INVALIDO");
        }

        if (codes.length > 0) {
            issues.push({
                saleId: sale.id,
                codes,
            });
        }
    }

    const salesCount = sales.length;

    const salesTotal = sales.reduce(
        (total, sale) => total + sale.finalTotal,
        0
    );

    const snapshotHash = createHash("sha256")
        .update(JSON.stringify(sales))
        .digest("hex");

    return {
        salesCount,
        salesTotal,
        snapshotHash,
        issues,
        canReview: salesCount > 0 && issues.length === 0,
    };
}