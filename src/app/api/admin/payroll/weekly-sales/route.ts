
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
    validatePayrollWeek,
    hasValidCommissionPayrollAttribution,
    saleSpansPayrollWeeks,
} from "@/lib/payroll/review-validation";
import { addTeffDays } from "@/lib/datetime";

export async function GET(request: Request) {
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

    const week = new URL(request.url).searchParams.get("week");
    const start = validatePayrollWeek(week);

    if (!start) {
        return Response.json(
            { error: "Semana inválida." },
            { status: 400 }
        );
    }

    const nextMonday = addTeffDays(week!, 7);
    const end = new Date(`${nextMonday}T00:00:00.000Z`);

    try {
        const commissions = await prisma.commission.findMany({
            where: {
                sale: {
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
            },
            select: {
                id: true,
                saleId: true,
                employeeId: true,
                commissionBase: true,
                commissionRate: true,
                commissionAmount: true,
                status: true,
                payrollEntryId: true,
                sale: {
                    select: {
                        id: true,
                        createdAt: true,
                        subtotal: true,
                        discountTotal: true,
                        finalTotal: true,
                        saleAppointments: {
                            select: {
                                appointment: {
                                    select: {
                                        employeeId: true,
                                        date: true,
                                        customer: {
                                            select: {
                                                name: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        lineItems: {
                            select: {
                                id: true,
                                itemName: true,
                                itemType: true,
                                unitPrice: true,
                                employeeId: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                { saleId: "asc" },
                { id: "asc" },
            ],
        });

        const sales = commissions.map((commission) => {
            const validAttribution =
                hasValidCommissionPayrollAttribution(
                    commission,
                    start,
                    end
                );

            const crossWeek =
                saleSpansPayrollWeeks(
                    commission,
                    start,
                    end
                );

            const attributedItems =
                commission.sale.lineItems.filter(
                    (item) =>
                        item.employeeId ===
                        commission.employeeId
                );

            return {
                commissionId: commission.id,
                saleId: commission.saleId,
                employeeId: commission.employeeId,
                saleDate: commission.sale.createdAt,
                serviceDates: [
                    ...new Set(
                        commission.sale.saleAppointments.map(
                            ({ appointment }) =>
                                appointment.date
                                    .toISOString()
                                    .slice(0, 10)
                        )
                    ),
                ],
                customerNames: [
                    ...new Set(
                        commission.sale.saleAppointments.map(
                            ({ appointment }) =>
                                appointment.customer.name
                        )
                    ),
                ],
                production: commission.commissionBase,
                commissionRate: commission.commissionRate,
                commissionAmount: commission.commissionAmount,
                commissionStatus: commission.status,
                payrollEntryId: commission.payrollEntryId,
                saleTotal: commission.sale.finalTotal,
                services: attributedItems.map((item) => ({
                    id: item.id,
                    name: item.itemName,
                    type: item.itemType,
                    price: item.unitPrice,
                })),
                legacyAttribution:
                    commission.sale.lineItems.every(
                        (item) => item.employeeId === null
                    ),
                validAttribution,
                crossWeek,
            };
        });

        return Response.json({
            week,
            readOnly: true,
            sales,
        });
    } catch (error) {
        console.error(
            "Failed to load weekly payroll sales:",
            error
        );

        return Response.json(
            { error: "No se pudieron cargar las ventas." },
            { status: 500 }
        );
    }
}