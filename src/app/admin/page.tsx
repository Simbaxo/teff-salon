import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
    addTeffDays,
    getTeffDayOfWeek,
    getTeffDayStart,
    getTeffToday,
} from "@/lib/datetime";
import InternalNav from "@/components/InternalNav";

export default async function AdminPage() {
    const session = await auth();

    // Owner reporting contains sensitive financial information
    // so only authenticated OWNER accounts may access this page
    if (!session?.user || session.user.role !== "OWNER") {
        redirect("/login");
    }

    // Medellín-local date used for today's dashboard metrics.
    const today = getTeffToday();

    const todayStart =
        getTeffDayStart(today);

    const tomorrow =
        getTeffDayStart(
            addTeffDays(today, 1)
        );

    const todaysSales = await prisma.sale.findMany({
        where: {
            createdAt: {
                gte: todayStart,
                lt: tomorrow,
            },
        },
        select: {
            id: true,
            finalTotal: true,
            createdAt: true,

            payments: {
                select: {
                    paymentMethod: true,
                    amount: true,
                    processingFee: true,
                },
            },

            tips: {
                select: {
                    amount: true,
                    paymentMethod: true,
                },
            },

            commissions: {
                select: {
                    commissionAmount: true,
                },
            },

            saleAppointments: {
                select: {
                    appointment: {
                        select: {
                            customerId: true,

                            customer: {
                                select: {
                                    name: true,
                                },
                            },

                            employee: {
                                select: {
                                    id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    const todaysSalesTotal = todaysSales.reduce(
        (total, sale) => total + sale.finalTotal,
        0
    );

    const todaysSaleCount = todaysSales.length;

    // Each completed sale represents one customer visit.
    // This correctly counts repeated Cliente Sin Cita visits separately.
    const todaysCustomers =
        todaysSaleCount;

    const todaysAverageTicket =
        todaysSaleCount > 0
            ? Math.round(todaysSalesTotal / todaysSaleCount)
            : 0;
    
    const todaysCommissionTotal =
        todaysSales.reduce(
            (total, sale) =>
                total +
                sale.commissions.reduce(
                    (saleTotal, commission) =>
                        saleTotal +
                        commission.commissionAmount,
                    0
                ),
            0
        );

    const todaysTipTotal =
        todaysSales.reduce(
            (total, sale) =>
                total +
                sale.tips.reduce(
                    (saleTotal, tip) =>
                        saleTotal + tip.amount,
                    0
                ),
            0
        );

    const todaysPaymentTotals = {
        CASH: 0,
        BOLD: 0,
        TRANSFER: 0,
    };

    for (const sale of todaysSales) {
        for (const payment of sale.payments) {
            if (
                payment.paymentMethod === "CASH" ||
                payment.paymentMethod === "BOLD" ||
                payment.paymentMethod === "TRANSFER"
            ) {
                todaysPaymentTotals[
                    payment.paymentMethod
                ] += payment.amount;
            }
        }
    }

    const todaysCashTotal =
        todaysPaymentTotals.CASH;

    const todaysBoldTotal =
        todaysPaymentTotals.BOLD;

    const todaysTransferTotal =
        todaysPaymentTotals.TRANSFER;

    const todaysBoldFees =
        todaysSales.reduce(
            (total, sale) =>
                total +
                sale.payments.reduce(
                    (saleTotal, payment) =>
                        saleTotal +
                        payment.processingFee,
                    0
                ),
            0
        );

    const todaysAppointments = await prisma.appointment.count({
        where: {
            date: todayStart,
            status: {
                in: [
                    "BOOKED",
                    "REQUESTED",
                    "CHECKED_IN",
                    "IN_PROGRESS",
                    "COMPLETED",
                ],
            },
        },
    });

    const todaysAppointmentsByStatus =
        await prisma.appointment.groupBy({
            by: ["status"],

            where: {
                date: todayStart,
            },

            _count: {
                _all: true,
            },
        });

    const appointmentStatusCounts =
        Object.fromEntries(
            todaysAppointmentsByStatus.map(
                (item) => [
                    item.status,
                    item._count._all,
                ]
            )
        );

    const todaysCompletedAppointments =
        appointmentStatusCounts.COMPLETED ?? 0;

    const todaysInProgressAppointments =
        appointmentStatusCounts.IN_PROGRESS ?? 0;

    const todaysCheckedInAppointments =
        appointmentStatusCounts.CHECKED_IN ?? 0;

    const todaysBookedAppointments =
        (appointmentStatusCounts.BOOKED ?? 0) +
        (appointmentStatusCounts.REQUESTED ?? 0);

    const todaysCancelledAppointments =
        appointmentStatusCounts.CANCELLED ?? 0;

    const todaysNoShowAppointments =
        appointmentStatusCounts.NO_SHOW ?? 0;

    const recentActivity =
        todaysSales
            .slice()
            .sort(
                (a, b) =>
                    b.createdAt.getTime() -
                    a.createdAt.getTime()
            )
            .slice(0, 10)
            .map((sale) => {
                const customerNames = [
                    ...new Set(
                        sale.saleAppointments.map(
                            (item) =>
                                item.appointment
                                    .customer.name
                        )
                    ),
                ];

                const employeeNames = [
                    ...new Set(
                        sale.saleAppointments.map(
                            (item) =>
                                item.appointment
                                    .employee.name
                        )
                    ),
                ];

                return {
                    id: sale.id,
                    createdAt: sale.createdAt,
                    customers:
                        customerNames.join(", "),
                    employees:
                        employeeNames.join(", "),
                    total: sale.finalTotal,
                };
            });

    const dayOfWeek =
        getTeffDayOfWeek(today);

    const daysSinceMonday =
        dayOfWeek === 0
            ? 6
            : dayOfWeek - 1;

    const weekStartDate =
        addTeffDays(
            today,
            -daysSinceMonday
        );

    const weekEndDate =
        addTeffDays(
            weekStartDate,
            7
        );

    const weekStart =
        getTeffDayStart(
            weekStartDate
        );

    const weekEnd =
        getTeffDayStart(
            weekEndDate
        );

    // Get all sales recorded during the current week
    const weeklySales = await prisma.sale.findMany({
        where: {
            createdAt: {
                gte: weekStart,
                lt: weekEnd,
            },
        },
        select: {
            finalTotal: true,
            saleAppointments: {
                select: {
                    appointment: {
                        select: {
                            customerId: true,
                        },
                    },
                },
            },
        },
    });

    const weeklySalesTotal = weeklySales.reduce(
        (total, sale) => total + sale.finalTotal,
        0
    );

    const weeklySaleCount = weeklySales.length;

    // Count customer visits that produced sales,
    // not unique Customer database records
    const weeklyCustomers =
        weeklySaleCount;

    const weeklyAverageTicket =
        weeklySaleCount > 0
            ? Math.round(weeklySalesTotal / weeklySaleCount)
            : 0;
    
    const weeklyAppointments = await prisma.appointment.count({
        where: {
            date: {
                gte: weekStart,
                lt: weekEnd,
            },
            status: {
                in: [
                    "BOOKED",
                    "REQUESTED",
                    "CHECKED_IN",
                    "IN_PROGRESS",
                    "COMPLETED",
                ]
            }
        }
    })

    // Calculate the current calendar month
    // monthStart = first day of this month
    // monthEnd = first day of next month
    const monthStart = new Date(
        Date.UTC(
            todayStart.getUTCFullYear(),
            todayStart.getUTCMonth(),
            1
        )
    );

    const monthEnd = new Date(
        Date.UTC(
            todayStart.getUTCFullYear(),
            todayStart.getUTCMonth() + 1,
            1
        )
    );

    // Get all sales recorded durning the current month
    const monthlySales = await prisma.sale.findMany({
        where: {
            createdAt: {
                gte: monthStart,
                lt: monthEnd,
            },
        },
        select: {
            finalTotal: true,
            saleAppointments: {
                select: {
                    appointment: {
                        select: {
                            customerId: true,
                        },
                    },
                },
            },
        },
    });

    const monthlySalesTotal = monthlySales.reduce(
        (total, sale) => total + sale.finalTotal,
        0
    );

    const monthlySaleCount = monthlySales.length;

    const monthlyCustomers =
        monthlySaleCount;

    const monthlyAverageTicket =
        monthlySaleCount > 0
            ? Math.round(monthlySalesTotal / monthlySaleCount)
            : 0;
    
    const monthlyAppointments = await prisma.appointment.count({
        where: {
            date: {
                gte: monthStart,
                lt: monthEnd,
            },
            status: {
                in: [
                    "BOOKED",
                    "REQUESTED",
                    "CHECKED_IN",
                    "IN_PROGRESS",
                    "COMPLETED",
                ],
            },
        },
    });

    // Load TEFF's configurable business goals
    const salonSettings = await prisma.salonSettings.findFirst();

    const weeklySalesGoal = salonSettings?.weeklySalesGoal ?? 0;

    const monthlySalesGoal = salonSettings?.monthlySalesGoal ?? 0;

    // Calculate progress toward this week's sales goal
    const weeklyGoalProgress =
        weeklySalesGoal > 0
            ? Math.min(
                Math.round((weeklySalesTotal / weeklySalesGoal) * 100),
                100
            )
            : 0;

    // Calculate progress toward this month's sales goal
    const monthlyGoalProgress =
        monthlySalesGoal > 0
            ? Math.min(
                Math.round((monthlySalesTotal / monthlySalesGoal) * 100),
                100
            )
            : 0;

    // Group recorded payments by method so the owner can reconcile
    // cash, Bold, and bank transfers against the real-world balances
    const paymentTotals = await prisma.payment.groupBy({
        by: ["paymentMethod"],
        where: {
            createdAt: {
                gte: weekStart,
                lt: weekEnd,
            },
        },
        _sum: {
            amount: true,
        },
    });

    const paymentByMethod = Object.fromEntries(
        paymentTotals.map((payment) => [
            payment.paymentMethod,
            payment._sum.amount ?? 0,
        ])
    );

    const cashTotal = paymentByMethod.CASH ?? 0;
    const boldTotal = paymentByMethod.BOLD ?? 0;
    const transferTotal = paymentByMethod.TRANSFER ?? 0;

    // Tips are tracked separately because they belong directly to technicians,
    // even when the salon receives the money through Bold or bank transfer
    const tipSummary = await prisma.tip.aggregate({
        where: {
            createdAt: {
                gte: weekStart,
                lt: weekEnd,
            },
        },
        _sum: {
            amount: true,
        },
    });

    const totalTips = tipSummary._sum.amount ?? 0;

    // Electronic tips car collected by TEFF and are part of the customer's payment
    // Use the payment method instead of payout status because the tip may later
    // be marked PAID without changing the original payment received by the salon
    const salonCollectedTipSummary = await prisma.tip.aggregate({
        where: {
            createdAt: {
                gte: weekStart,
                lt: weekEnd,
            },
            paymentMethod: {
                in: ["BOLD", "TRANSFER"],
            },
        },
        _sum: {
            amount: true,
        },
    });

    const salonCollectedTips =
        salonCollectedTipSummary._sum.amount ?? 0;

    // Total money recorded as received by the salon across every payment method
    const totalPayments = cashTotal + boldTotal + transferTotal;

    // Compare this week's payments against this week's salon revenue and tips
    const reconciliationDifference =
        totalPayments - weeklySalesTotal - salonCollectedTips;

    // Start from active technicians so employees with zero commissions
    // still appear on the owner dashboard
    const employeesWithCommissions = await prisma.employee.findMany({
        where: {
            active: true,
        },
        select: {
            id: true,
            name: true,
            commissions: {
                select: {
                    commissionBase: true,
                    commissionAmount: true,
                    status: true,
                    createdAt: true,
                },
            },
        },
        orderBy: {
            name: "asc"
        },
    });

    const commissionSummary = employeesWithCommissions.map((employee) => {
        let sales = 0;
        let total = 0;
        let pending = 0;
        let paid = 0;

        for (const commission of employee.commissions) {
            // Only count production from the current Monday - Sunday week
            if (
                commission.createdAt >= weekStart &&
                commission.createdAt < weekEnd
            ) {
                // commissionBase represents the final sale amount attributed
                // to this technician before their commission is calculated
                sales += commission.commissionBase;
                total += commission.commissionAmount;

                if (commission.status === "PENDING") {
                    pending += commission.commissionAmount;
                }
    
                if (commission.status === "PAID") {
                    paid += commission.commissionAmount;
                }
            }
        }
        
        return {
            id: employee.id,
            name: employee.name,
            sales,
            total,
            pending,
            paid,
        };
    })

    // Format whole-peso COP values consistently across the owner dashboard
    const formatCOP = (value: number) =>
        new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            maximumFractionDigits: 0,
        }).format(value);
    
    const formatTime = (value: Date) =>
        new Intl.DateTimeFormat("es-CO", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "America/Bogota",
        }).format(value);
    
    const formatDate = (date: string) => {
        const [year, month, day] =
            date.split("-").map(Number);

        return new Intl.DateTimeFormat(
            "es-CO",
            {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
            }
        ).format(
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day
                )
            )
        );
    };

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-5xl">
                <h1 className="text-3xl font-bold text-black">
                    Panel del Propietario
                </h1>
                <p className="mt-2 text-neutral-600">
                    Resumen financiero básico de TEFF Beauty Salon.
                </p>

                <div className="mt-4">
                    <InternalNav userRole={session.user.role} />
                </div>

                {/* Today's operating dashboard */}
                <div className="mt-8">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2 className="text-2xl font-bold text-black">
                                Hoy
                            </h2>

                            <p className="mt-1 text-sm text-neutral-500">
                                Actividad operativa y financiera del salón.
                            </p>
                        </div>

                        <span className="rounded-full bg-[#B76E79]/10 px-3 py-1 text-sm font-semibold text-[#B76E79]">
                            {formatDate(today)}
                        </span>
                    </div>

                    {/* Main daily KPIs */}
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-sm font-medium text-neutral-500">
                                Ventas de Hoy
                            </p>

                            <p className="mt-2 text-2xl font-bold text-black">
                                {formatCOP(todaysSalesTotal)}
                            </p>
                        </div>

                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-sm font-medium text-neutral-500">
                                Clientes Atendidos
                            </p>

                            <p className="mt-2 text-2xl font-bold text-black">
                                {todaysCustomers}
                            </p>
                        </div>

                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-sm font-medium text-neutral-500">
                                Transacciones
                            </p>

                            <p className="mt-2 text-2xl font-bold text-black">
                                {todaysSaleCount}
                            </p>
                        </div>

                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-sm font-medium text-neutral-500">
                                Ticket Promedio
                            </p>

                            <p className="mt-2 text-2xl font-bold text-black">
                                {formatCOP(todaysAverageTicket)}
                            </p>
                        </div>
                    </div>

                    {/* Financial + appointment activity */}
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {/* Today's money */}
                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <h3 className="text-lg font-bold text-black">
                                Resumen Financiero
                            </h3>

                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-500">
                                        Comisiones
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {formatCOP(
                                            todaysCommissionTotal
                                        )}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-500">
                                        Propinas
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {formatCOP(
                                            todaysTipTotal
                                        )}
                                    </p>
                                </div>
                            </div>

                            <h4 className="mt-5 text-sm font-bold text-black">
                                Pagos Recibidos
                            </h4>

                            <div className="mt-3 space-y-3 text-sm">
                                <div className="flex justify-between gap-4">
                                    <span className="text-neutral-500">
                                        Efectivo
                                    </span>

                                    <span className="font-semibold text-black">
                                        {formatCOP(
                                            todaysCashTotal
                                        )}
                                    </span>
                                </div>

                                <div className="flex justify-between gap-4">
                                    <span className="text-neutral-500">
                                        Bold
                                    </span>

                                    <span className="font-semibold text-black">
                                        {formatCOP(
                                            todaysBoldTotal
                                        )}
                                    </span>
                                </div>

                                <div className="flex justify-between gap-4">
                                    <span className="text-neutral-500">
                                        Transferencia
                                    </span>

                                    <span className="font-semibold text-black">
                                        {formatCOP(
                                            todaysTransferTotal
                                        )}
                                    </span>
                                </div>

                                {todaysBoldFees > 0 && (
                                    <div className="flex justify-between gap-4 border-t border-neutral-200 pt-3">
                                        <span className="text-neutral-500">
                                            Comisión Bold
                                        </span>

                                        <span className="font-semibold text-black">
                                            {formatCOP(
                                                todaysBoldFees
                                            )}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Today's appointments */}
                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between gap-4">
                                <h3 className="text-lg font-bold text-black">
                                    Citas de Hoy
                                </h3>

                                <span className="text-2xl font-bold text-black">
                                    {todaysAppointments}
                                </span>
                            </div>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-500">
                                        Completadas
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {todaysCompletedAppointments}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-500">
                                        En Servicio
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {todaysInProgressAppointments}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-500">
                                        Cliente Llegó
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {todaysCheckedInAppointments}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-500">
                                        Próximas
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {todaysBookedAppointments}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-500">
                                        Canceladas
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {todaysCancelledAppointments}
                                    </p>
                                </div>

                                <div className="rounded-xl bg-neutral-50 p-4">
                                    <p className="text-sm text-neutral-500">
                                        No Asistió
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {todaysNoShowAppointments}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recent completed-sale activity */}
                    <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-black">
                                    Actividad Reciente
                                </h3>

                                <p className="mt-1 text-sm text-neutral-500">
                                    Últimas ventas completadas de hoy.
                                </p>
                            </div>
                        </div>

                        {recentActivity.length === 0 ? (
                            <p className="mt-4 text-sm text-neutral-500">
                                Todavía no hay ventas completadas hoy.
                            </p>
                        ) : (
                            <div className="mt-4 divide-y divide-neutral-200">
                                {recentActivity.map(
                                    (activity) => (
                                        <div
                                            key={activity.id}
                                            className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div>
                                                <p className="font-semibold text-black">
                                                    {activity.customers ||
                                                        "Cliente"}
                                                </p>

                                                <p className="mt-1 text-sm text-neutral-500">
                                                    {formatTime(
                                                        activity.createdAt
                                                    )}
                                                    {" · "}
                                                    {activity.employees ||
                                                        "Sin técnica"}
                                                </p>
                                            </div>

                                            <div className="sm:text-right">
                                                <p className="font-bold text-black">
                                                    {formatCOP(
                                                        activity.total
                                                    )}
                                                </p>

                                                <p className="mt-1 text-xs text-neutral-400">
                                                    Venta #{activity.id}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                </div>

                    {/* Current week's operating snapshot */}
                    <div className="mt-8">
                        <h2 className="text-xl font-bold text-black">
                            Esta Semana
                        </h2>

                        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-xl bg-white p-5 shadow-sm">
                                <p className="text-sm font-medium text-neutral-500">
                                    Ventas esta Semana
                                </p>

                                <p className="mt-2 text-2xl font-bold text-black">
                                    {formatCOP(weeklySalesTotal)}
                                </p>
                            </div>

                            <div className="rounded-xl bg-white p-5 shadow-sm">
                                <p className="text-sm font-medium text-neutral-500">
                                    Clientes esta Semana
                                </p>

                                <p className="mt-2 text-2xl font-bold text-black">
                                    {weeklyCustomers}
                                </p>
                            </div>

                            <div className="rounded-xl bg-white p-5 shadow-sm">
                                <p className="text-sm font-medium text-neutral-500">
                                    Citas esta Semana
                                </p>

                                <p className="mt-2 text-2xl font-bold text-black">
                                    {weeklyAppointments}
                                </p>
                            </div>

                            <div className="rounded-xl bg-white p-5 shadow-sm">
                                <p className="text-sm font-medium text-neutral-500">
                                    Ticket Promedio
                                </p>

                                <p className="mt-2 text-2xl font-bold text-black">
                                    {formatCOP(weeklyAverageTicket)}
                                </p>
                            </div>
                        </div>

                        {/* Weekly Sales Goal */}
                        <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-neutral-500">
                                        Meta Semanal
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {formatCOP(weeklySalesGoal)}
                                    </p>
                                </div>

                                <div className="text-right">
                                    <p className="text-sm font-medium text-neutral-500"> 
                                        Progreso
                                    </p>

                                    <p className="mt-1 text-xl font-bold text-black">
                                        {weeklyGoalProgress}%
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200">
                                <div
                                    className="h-full rounded-full bg-black transition-all"
                                    style={{ width: `${weeklyGoalProgress}%` }}
                                />
                            </div>

                            <div className="mt-3 flex justify-between text-sm text-neutral-500">
                                <span>
                                    {formatCOP(weeklySalesTotal)} vendidos
                                </span>

                                <span>
                                    Faltan{" "}
                                    {formatCOP(
                                        Math.max(weeklySalesGoal - weeklySalesTotal, 0)
                                    )}
                                </span>
                            </div>
                    </div>
                </div>
            </div>

            {/* Current month's operating snapshot */}
            <div className="mt-8">
                <h2 className="text-xl font-bold text-black">
                    Este Mes
                </h2>

                <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Ventas este Mes
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {formatCOP(monthlySalesTotal)}
                        </p>
                    </div>

                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Clientes este Mes
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {monthlyCustomers}
                        </p>
                    </div>

                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Citas este Mes
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {monthlyAppointments}
                        </p>
                    </div>

                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Ticket Promedio
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {formatCOP(monthlyAverageTicket)}
                        </p>
                    </div>
                </div>

                {/* Monthly sales goal */}
                <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-neutral-500">
                                Meta Mensual
                            </p>

                            <p className="mt-1 text-xl font-bold text-black">
                                {formatCOP(monthlySalesGoal)}
                            </p>
                        </div>

                        <div className="text-right">
                            <p className="text-sm font-medium text-neutral-500">
                                Progreso
                            </p>

                            <p className="mt-1 text-xl font-bold text-black">
                                {monthlyGoalProgress}%
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-neutral-200">
                        <div
                            className="h-full rounded-full bg-black transition-all"
                            style={{ width: `${monthlyGoalProgress}%` }}
                        />
                    </div>

                    <div className="mt-3 flex justify-between text-sm text-neutral-500">
                        <span>
                            {formatCOP(monthlySalesTotal)} vendidos
                        </span>

                        <span>
                            Faltan{" "}
                            {formatCOP(
                                Math.max(monthlySalesGoal - monthlySalesTotal, 0)
                            )}
                        </span>
                    </div>
                </div>
            </div>

            <div className="mt-8">
                <h2 className="text-xl font-bold text-black">
                    Pagos - Esta Semana
                </h2>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Efectivo
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {formatCOP(cashTotal)}
                        </p>
                    </div>

                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Bold
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {formatCOP(boldTotal)}
                        </p>
                    </div>

                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Transferencia
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {formatCOP(transferTotal)}
                        </p>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-xl font-bold text-black">
                            Reconciliación - Esta Semana
                        </h2>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="rounded-xl bg-white p-5 shadow-sm">
                                <p className="text-sm font-medium text-neutral-500">
                                    Propinas
                                </p>

                                <p className="mt-2 text-2xl font-bold text-black">
                                    {formatCOP(totalTips)}
                                </p>
                            </div>

                            <div className="rounded-xl bg-white p-5 shadow-sm">
                                <p className="text-sm font-medium text-neutral-500">
                                    Diferencia
                                </p>

                                <p className="mt-2 text-2xl font-bold text-black">
                                    {formatCOP(reconciliationDifference)}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8">
                        <h2 className="text-xl font-bold text-black">
                            Ventas por Técnica - Esta Semana
                        </h2>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            {commissionSummary.map((employee) => (
                                <div
                                    key={employee.id}
                                    className="rounded-xl bg-white p-5 shadow-sm"
                                >
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-black">
                                            {employee.name}
                                        </h3>

                                        <span className="text-lg font-bold text-black">
                                            {formatCOP(employee.sales)}
                                        </span>
                                    </div>

                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="mt-8">
                        <h2 className="text-xl font-bold text-black">
                            Comisiones por Técnica - Esta Semana
                        </h2>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            {commissionSummary.map((employee) => (
                                <div
                                    key={employee.id}
                                    className="rounded-xl bg-white p-5 shadow-sm"
                                >
                                    <h3 className="text-lg font-semibold text-black">
                                        {employee.name}
                                    </h3>

                                    <div className="mt-4 space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-neutral-500">
                                                Comisión total
                                            </span>
                                            <span className="font-semibold text-black">
                                                {formatCOP(employee.total)}
                                            </span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span className="text-neutral-500">
                                                Pendiente
                                            </span>
                                            <span className="font-semibold text-black">
                                                {formatCOP(employee.pending)}
                                            </span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span className="text-neutral-500">
                                                Pagado
                                            </span>
                                            <span className="font-semibold text-black">
                                                {formatCOP(employee.paid)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}