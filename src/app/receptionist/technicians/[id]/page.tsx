import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTeffToday } from "@/lib/datetime";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

type PageProps = {
    params: Promise<{
        id: string;
    }>;
};

function formatCOP(value: number) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
    }).format(value);
}

function formatDate(date: Date) {
    return new Intl.DateTimeFormat("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(date);
}

function formatTime(time: string) {
    const [hours, minutes] = time
        .slice(0, 5)
        .split(":")
        .map(Number);

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);

    return new Intl.DateTimeFormat("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(date);
}

export default async function TechnicianReceptionPage({
    params,
}: PageProps) {
    const session = await auth();

    if (
        !session?.user ||
        !["OWNER", "RECEPTIONIST"].includes(session.user.role)
    ) {
        redirect("/login");
    }

    const { id } = await params;
    const employeeId = Number(id);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
        notFound();
    }

    const employee = await prisma.employee.findUnique({
        where: {
            id: employeeId,
        },
        select: {
            id: true,
            name: true,
        },
    });

    if (!employee) {
        notFound();
    }

    const today = getTeffToday();
    const todayStart = new Date(`${today}T00:00:00.000Z`);

    const tomorrow = new Date(todayStart);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

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

    // Production comes from commissionBase so this page reconciles
    // with the Reception dashboard without exposing commission pay.
    const monthlyCommissions =
        await prisma.commission.findMany({
            where: {
                employeeId,
                createdAt: {
                    gte: monthStart,
                    lt: monthEnd,
                },
            },
            select: {
                commissionBase: true,
                saleId: true,
                sale: {
                    select: {
                        createdAt: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

    const monthlyProduction =
        monthlyCommissions.reduce(
            (total, commission) =>
                total + commission.commissionBase,
            0
        );

    const todayProduction =
        monthlyCommissions
            .filter(
                (commission) =>
                    commission.sale.createdAt >= todayStart &&
                    commission.sale.createdAt < tomorrow
            )
            .reduce(
                (total, commission) =>
                    total + commission.commissionBase,
                0
            );

    // Completed appointments are queried directly by technician so
    // multi-technician sales do not mix another tech's appointments.
    const monthlyAppointments =
        await prisma.appointment.findMany({
            where: {
                employeeId,
                status: "COMPLETED",
                date: {
                    gte: monthStart,
                    lt: monthEnd,
                },
            },
            select: {
                id: true,
                date: true,
                startTime: true,
                customer: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                appointmentServices: {
                    select: {
                        service: {
                            select: {
                                nameEs: true,
                            },
                        },
                    },
                },
                appointmentAddons: {
                    select: {
                        addon: {
                            select: {
                                nameEs: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                {
                    date: "desc",
                },
                {
                    startTime: "desc",
                },
            ],
        });

    const todayAppointments =
        monthlyAppointments.filter(
            (appointment) =>
                appointment.date >= todayStart &&
                appointment.date < tomorrow
        );

    const monthlyCustomerIds = new Set(
        monthlyAppointments.map(
            (appointment) => appointment.customer.id
        )
    );

    const todayCustomerIds = new Set(
        todayAppointments.map(
            (appointment) => appointment.customer.id
        )
    );

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-5xl">
                <Link
                    href="/receptionist"
                    className="text-sm font-semibold text-neutral-600 hover:text-black"
                >
                    ← Volver a Recepción
                </Link>

                <div className="mt-5">
                    <h1 className="text-3xl font-bold text-black">
                        {employee.name}
                    </h1>

                    <p className="mt-2 text-neutral-600">
                        Actividad y producción
                    </p>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Hoy
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {formatCOP(todayProduction)}
                        </p>

                        <p className="mt-2 text-sm text-neutral-500">
                            {todayAppointments.length}{" "}
                            {todayAppointments.length === 1
                                ? "cita completada"
                                : "citas completadas"}
                            {" · "}
                            {todayCustomerIds.size}{" "}
                            {todayCustomerIds.size === 1
                                ? "cliente"
                                : "clientes"}
                        </p>
                    </div>

                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-sm font-medium text-neutral-500">
                            Este mes
                        </p>

                        <p className="mt-2 text-2xl font-bold text-black">
                            {formatCOP(monthlyProduction)}
                        </p>

                        <p className="mt-2 text-sm text-neutral-500">
                            {monthlyAppointments.length}{" "}
                            {monthlyAppointments.length === 1
                                ? "cita completada"
                                : "citas completadas"}
                            {" · "}
                            {monthlyCustomerIds.size}{" "}
                            {monthlyCustomerIds.size === 1
                                ? "cliente"
                                : "clientes"}
                        </p>
                    </div>
                </div>

                <div className="mt-8">
                    <h2 className="text-xl font-bold text-black">
                        Citas completadas este mes
                    </h2>

                    {monthlyAppointments.length === 0 ? (
                        <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-neutral-500">
                                No hay citas completadas este mes.
                            </p>
                        </div>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {monthlyAppointments.map((appointment) => (
                                <div
                                    key={appointment.id}
                                    className="rounded-xl bg-white p-5 shadow-sm"
                                >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <p className="font-bold text-black">
                                                {appointment.customer.name}
                                            </p>

                                            <p className="mt-1 text-sm text-neutral-500">
                                                {formatDate(appointment.date)}
                                                {" · "}
                                                {formatTime(
                                                    appointment.startTime
                                                )}
                                            </p>

                                            <p className="mt-2 text-sm text-neutral-700">
                                                {appointment.appointmentServices
                                                    .map(
                                                        (item) =>
                                                            item.service.nameEs
                                                    )
                                                    .join(", ")}
                                            </p>

                                            {appointment.appointmentAddons.length >
                                                0 && (
                                                <p className="mt-1 text-sm text-neutral-500">
                                                    +
                                                    {" "}
                                                    {appointment.appointmentAddons
                                                        .map(
                                                            (item) =>
                                                                item.addon.nameEs
                                                        )
                                                        .join(", ")}
                                                </p>
                                            )}
                                        </div>

                                        <Link
                                            href={`/staff/customers/${appointment.customer.id}`}
                                            className="text-sm font-semibold text-black hover:underline"
                                        >
                                            Ver cliente
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}