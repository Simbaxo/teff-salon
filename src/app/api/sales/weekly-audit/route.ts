
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validatePayrollWeek } from "@/lib/payroll/review-validation";
import { addTeffDays } from "@/lib/datetime";
import { getWeeklySalesSnapshot } from "@/lib/sales/weekly-review-snapshot";

export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (
        session.user.role !== "OWNER" &&
        session.user.role !== "RECEPTIONIST"
    ) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    const week = new URL(request.url).searchParams.get("week");
    const start = validatePayrollWeek(week);

    if (!start || !week) {
        return Response.json(
            { error: "Semana inválida." },
            { status: 400 }
        );
    }

    const nextMonday = addTeffDays(week, 7);
    const end = new Date(`${nextMonday}T00:00:00.000Z`);

    try {
        const { sales, snapshot } = await prisma.$transaction(
            async (tx) => {
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
                    select: {
                        id: true,
                        itemName: true,
                        itemType: true,
                        unitPrice: true,
                        employeeId: true,
                    },
                },
                payments: {
                    select: {
                        paymentMethod: true,
                        amount: true,
                        processingFee: true,
                    },
                },
                tips: {
                    select: {
                        employeeId: true,
                        amount: true,
                        paymentMethod: true,
                        employee: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
                commissions: {
                    select: {
                        employeeId: true,
                        commissionBase: true,
                        employee: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                saleAppointments: {
                    select: {
                        appointment: {
                            select: {
                                date: true,
                                employeeId: true,
                                employee: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                                customer: {
                                    select: {
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
                    orderBy: {
                        id: "asc",
                    },
                });

                const snapshot = await getWeeklySalesSnapshot(
                    tx,
                    week
                );

                return { sales, snapshot };
            },
            {
                isolationLevel: "Serializable",
            }
        );

        const results = sales.map((sale) => {
            const dates = sale.saleAppointments.map(
                ({ appointment }) => appointment.date
            );

            const crossWeek = dates.some(
                (date) => date < start || date >= end
            );

            const attributedCount = sale.lineItems.filter(
                (item) => item.employeeId !== null
            ).length;

            const attributionMode =
                sale.lineItems.length === 0
                    ? "NO_LINE_ITEMS"
                    : attributedCount === 0
                      ? "LEGACY"
                      : attributedCount === sale.lineItems.length
                        ? "ATTRIBUTED"
                        : "PARTIAL";

            const technicians = sale.commissions.map(
                (commission) => ({
                    employeeId: commission.employeeId,
                    name: commission.employee.name,
                    production: commission.commissionBase,
                    services:
                        attributionMode === "ATTRIBUTED"
                            ? sale.lineItems
                                  .filter(
                                      (item) =>
                                          item.employeeId ===
                                          commission.employeeId
                                  )
                                  .map((item) => ({
                                      id: item.id,
                                      name: item.itemName,
                                      type: item.itemType,
                                      price: item.unitPrice,
                                  }))
                            : [],
                })
            );

            const allocatedProduction = technicians.reduce(
                (sum, technician) =>
                    sum + technician.production,
                0
            );

            const issues: string[] = [];

            if (crossWeek) {
                issues.push("VENTA_ENTRE_SEMANAS");
            }

            if (sale.commissions.length === 0) {
                issues.push("SIN_ASIGNACION_PRODUCCION");
            }

            if (
                attributionMode === "PARTIAL" ||
                attributionMode === "NO_LINE_ITEMS"
            ) {
                issues.push("ATRIBUCION_INCOMPLETA");
            }

            if (allocatedProduction !== sale.finalTotal) {
                issues.push("PRODUCCION_NO_CONCILIA");
            }

            if (
                attributionMode === "ATTRIBUTED" &&
                sale.lineItems.some(
                    (item) =>
                        !technicians.some(
                            (technician) =>
                                technician.employeeId === item.employeeId
                        )
                )
            ) {
                issues.push("TECNICA_SIN_PRODUCCION");
            }

            return {
                saleId: sale.id,
                saleDate: sale.createdAt,
                serviceDates: [
                    ...new Set(
                        dates.map((date) =>
                            date.toISOString().slice(0, 10)
                        )
                    ),
                ],
                customers: [
                    ...new Set(
                        sale.saleAppointments.map(
                            ({ appointment }) =>
                                appointment.customer.name
                        )
                    ),
                ],
                subtotal: sale.subtotal,
                discountTotal: sale.discountTotal,
                finalTotal: sale.finalTotal,
                attributionMode,
                technicians,
                payments: sale.payments,
                tips: sale.tips.map((tip) => ({
                    employeeId: tip.employeeId,
                    employeeName: tip.employee.name,
                    amount: tip.amount,
                    paymentMethod: tip.paymentMethod,
                })),
                issues,
            };
        });

        return Response.json({
            week,
            readOnly: true,
            sales: results,
            snapshotHash: snapshot.snapshotHash,
            canReview: snapshot.canReview,
            reviewIssues: snapshot.issues,
        });
    } catch (error) {
        console.error(
            "Failed to load weekly sales audit:",
            error
        );

        return Response.json(
            { error: "No se pudo cargar la revisión semanal." },
            { status: 500 }
        );
    }
}