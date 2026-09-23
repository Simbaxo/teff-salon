import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getTeffToday } from "@/lib/datetime";
import ReceptionistPageClient from "./ReceptionistPageClient";
import { prisma } from "@/lib/prisma";
import InternalNav from "@/components/InternalNav";


export default async function ReceptionistPage() {
    const session = await auth();

    // Reception operations are available to the owner and receptionist
    if (
        !session?.user ||
        !["OWNER", "RECEPTIONIST"].includes(session.user.role)
    ) {
        redirect("/login");
    }

    const today = getTeffToday();

    const todayStart = new Date(`${today}T00:00:00.000Z`);

    // Current TEFF week: Monday through Sunday.
    const weekStart = new Date(todayStart);
    const dayOfWeek = weekStart.getUTCDay();

    const daysSinceMonday =
        dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    weekStart.setUTCDate(
        weekStart.getUTCDate() - daysSinceMonday
    );

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    // Current week's salon sales.
    const weeklySales = await prisma.sale.aggregate({
        where: {
            createdAt: {
                gte: weekStart,
                lt: weekEnd,
            },
        },
        _sum: {
            finalTotal: true,
        },
    });

    const weeklySalesTotal =
        weeklySales._sum.finalTotal ?? 0;

    // Current Calendar Month
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

    const monthlySales = await prisma.sale.aggregate({
        where: {
            createdAt: {
                gte: monthStart,
                lt: monthEnd,
            },
        },
        _sum: {
            finalTotal: true,
        },
    });

    const monthlySalesTotal =
        monthlySales._sum.finalTotal ?? 0;

    // Load the configurable weekly sales goal.
    const salonSettings =
        await prisma.salonSettings.findFirst();

    const weeklySalesGoal =
        salonSettings?.weeklySalesGoal ?? 0;

    const monthlySalesGoal =
    salonSettings?.monthlySalesGoal ?? 0;

    const monthlyGoalProgress =
        monthlySalesGoal > 0
            ? Math.min(
                Math.round(
                    (monthlySalesTotal / monthlySalesGoal) * 100
                ),
                100
            )
            : 0;

    const weeklyGoalProgress =
        weeklySalesGoal > 0
            ? Math.min(
                Math.round(
                    (weeklySalesTotal / weeklySalesGoal) * 100
                ),
                100
            )
            : 0;

    // Reception only needs production/client counts.
    // Commission payout amounts remain owner-only.
    const weeklyTechnicianData =
        await prisma.employee.findMany({
            where: {
                active: true,
            },
            select: {
                id: true,
                name: true,
                commissions: {
                    where: {
                        createdAt: {
                            gte: weekStart,
                            lt: weekEnd,
                        },
                    },
                    select: {
                        commissionBase: true,
                        sale: {
                            select: {
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
                        },
                    },
                },
            },
            orderBy: {
                name: "asc",
            },
        });

    const weeklyTechnicianSummary =
        weeklyTechnicianData.map((employee) => {
            const sales = employee.commissions.reduce(
                (total, commission) =>
                    total + commission.commissionBase,
                0
            );

            const customerIds = new Set(
                employee.commissions.flatMap(
                    (commission) =>
                        commission.sale.saleAppointments.map(
                            (saleAppointment) =>
                                saleAppointment.appointment.customerId
                        )
                )
            );

            return {
                id: employee.id,
                name: employee.name,
                sales,
                customers: customerIds.size,
            };
        });

    // Monthly technician production for reception.
    // Commission payout amounts remain owner-only.
    const monthlyTechnicianData =
        await prisma.employee.findMany({
            where: {
                active: true,
            },
            select: {
                id: true,
                name: true,
                commissions: {
                    where: {
                        createdAt: {
                            gte: monthStart,
                            lt: monthEnd,
                        },
                    },
                    select: {
                        commissionBase: true,
                        sale: {
                            select: {
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
                        },
                    },
                },
            },
            orderBy: {
                name: "asc",
            },
        });

    const monthlyTechnicianSummary =
        monthlyTechnicianData.map((employee) => {
            const sales = employee.commissions.reduce(
                (total, commission) =>
                    total + commission.commissionBase,
                0
            );

            const customerIds = new Set(
                employee.commissions.flatMap(
                    (commission) =>
                        commission.sale.saleAppointments.map(
                            (saleAppointment) =>
                                saleAppointment.appointment.customerId
                        )
                )
            );

            return {
                id: employee.id,
                name: employee.name,
                sales,
                customers: customerIds.size,
            };
        });

    const tomorrow = new Date(todayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const todaysSales = await prisma.sale.aggregate({
        where: {
            createdAt: {
                gte: todayStart,
                lt: tomorrow,
            },
        },
        _sum: {
            finalTotal: true,
        },
    });

    const todaysSalesTotal = todaysSales._sum.finalTotal ?? 0;

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-6xl">
                <div>
                    <h1 className="text-3xl font-bold text-black">
                        Panel de Recepción
                    </h1>

                    <p className="mt-2 text-neutral-600">
                        Operación diaria de TEFF Beauty Salon.
                    </p>

                    <p className="mt-1 text-sm text-neutral-500">
                        {today}
                    </p>

                    <div className="mt-4">
                        <InternalNav userRole={session.user.role} />
                    </div>
                </div>

               <ReceptionistPageClient 
                todaysSalesTotal={todaysSalesTotal}
                weeklySalesTotal={weeklySalesTotal}
                weeklySalesGoal={weeklySalesGoal}
                weeklyGoalProgress={weeklyGoalProgress}
                weeklyTechnicianSummary={weeklyTechnicianSummary}
                monthlySalesTotal={monthlySalesTotal}
                monthlySalesGoal={monthlySalesGoal}
                monthlyGoalProgress={monthlyGoalProgress}
                monthlyTechnicianSummary={monthlyTechnicianSummary}
               />
            </div>
        </main>
    );
}