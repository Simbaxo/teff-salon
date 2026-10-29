import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { groupFinalizedTechnicianItems } from "@/lib/technicians/group-finalized-items";
import { resolveSaleItemCustomer } from "@/lib/technicians/resolve-sale-item-customer";
import {
    getTeffToday,
    getTeffDayStart,
    addTeffDays,
} from "@/lib/datetime";
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

    // Financial timestamps use Medellín-local calendar boundaries.
    // Appointment calendar dates continue using UTC midnight.
    const financialTodayStart = getTeffDayStart(today);

    const financialTomorrow = getTeffDayStart(
        addTeffDays(today, 1)
    );

    const [year, month] = today.split("-").map(Number);

    const financialMonthStart = getTeffDayStart(
        `${today.slice(0, 7)}-01`
    );

    const nextMonthDate = new Date(
        Date.UTC(year, month, 1)
    ).toISOString().slice(0, 10);

    const financialMonthEnd = getTeffDayStart(
        nextMonthDate
    );

    // Production comes from commissionBase so this page reconciles
    // with the Reception dashboard without exposing commission pay.
    const monthlyCommissions =
        await prisma.commission.findMany({
            where: {
                employeeId,
                createdAt: {
                    gte: financialMonthStart,
                    lt: financialMonthEnd,
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

    // Finalized checkout items attributed to this technician.
    // Includes services added at checkout without an appointmentId.
    const monthlyFinalizedItems = await prisma.saleLineItem.findMany({
        where: {
            employeeId,
            sale: {
                createdAt: {
                    gte: financialMonthStart,
                    lt: financialMonthEnd,
                },
            },
        },
        select: {
            id: true,
            saleId: true,
            itemType: true,
            itemName: true,
            unitPrice: true,
            employeeId: true,
            appointmentId: true,
            parentLineItemId: true,

            // Customer linked to this finalized service, when available.
            appointment: {
                select: {
                    customerId: true,
                    customer: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
            sale: {
                select: {
                    createdAt: true,
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

    // Group finalized checkout items by sale and credited technician.
    // Preserve customer attribution without guessing ownership.
    const finalizedSaleGroups = groupFinalizedTechnicianItems(
        employeeId,
        monthlyFinalizedItems
    ).map((group) => ({
        ...group,
        items: group.items.map((item) => ({
            ...item,
            resolvedCustomer: resolveSaleItemCustomer(item),
        })),
    }));

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
                    commission.sale.createdAt >= financialTodayStart &&
                    commission.sale.createdAt < financialTomorrow
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

                {/* Finalized checkout activity attributed to this technician */}
                {finalizedSaleGroups.length > 0 && (
                    <section className="mt-8">
                        <h2 className="text-xl font-bold text-black">
                            Servicios Finalizados Este Mes
                        </h2>

                        <p className="mt-2 text-sm text-neutral-500">
                            Servicios y complementos registrados en ventas,
                            atribuidos a esta técnica durante el checkout.
                        </p>

                        <div className="mt-4 space-y-4">
                            {finalizedSaleGroups.map((group) => (
                                <div
                                    key={group.saleId}
                                    className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
                                >
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 p-4">
                                        <div>
                                            <p className="font-semibold text-black">
                                                Venta #{group.saleId}
                                            </p>

                                            <p className="mt-1 text-xs text-neutral-500">
                                                {new Intl.DateTimeFormat("es-CO", {
                                                    timeZone: "America/Bogota",
                                                    day: "numeric",
                                                    month: "long",
                                                    year: "numeric",
                                                }).format(group.items[0].sale.createdAt)}
                                            </p>
                                        </div>

                                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                                            Venta registrada
                                        </span>
                                    </div>

                                    <div className="divide-y divide-neutral-100 px-4">
                                        {group.items.map((item) => (
                                            <div
                                                key={item.id}
                                                className="flex flex-wrap items-start justify-between gap-3 py-4"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-black">
                                                        {item.itemType === "ADDON"
                                                            ? "+ "
                                                            : ""}
                                                        {item.itemName}
                                                    </p>

                                                    <p className="mt-1 text-xs text-neutral-500">
                                                        {item.itemType === "ADDON"
                                                            ? "Complemento"
                                                            : "Servicio"}
                                                    </p>

                                                    {item.resolvedCustomer.status === "RESOLVED" ? (
                                                        <Link
                                                            href={`/staff/customers/${item.resolvedCustomer.customerId}`}
                                                            className="mt-1 inline-block text-xs font-medium text-[#B76E79] hover:underline"
                                                        >
                                                            {item.resolvedCustomer.customerName}
                                                        </Link>
                                                    ) : (
                                                        <p className="mt-1 text-xs text-amber-700">
                                                            {item.resolvedCustomer.status === "AMBIGUOUS"
                                                                ? "Cliente pendiente de verificar"
                                                                : "Cliente no identificado"}
                                                        </p>
                                                    )}
                                                </div>

                                                <span className="shrink-0 text-sm font-semibold text-black">
                                                    {formatCOP(item.unitPrice)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3">
                                        <p className="text-xs text-neutral-500">
                                            Precios registrados antes de posibles
                                            descuentos. La producción se calcula
                                            desde las comisiones de la venta.
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <details className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <summary className="cursor-pointer text-lg font-bold text-black">
                        Ver historial de citas originales
                    </summary>

                    <p className="mt-3 text-sm text-neutral-500">
                        Estas son las citas originalmente programadas.
                        Los servicios pueden haber cambiado durante el checkout.
                        Consulta Servicios Finalizados Este Mes para ver
                        los servicios registrados en las ventas.
                    </p>

                    <div className="mt-4">
                        <h2 className="text-lg font-semibold text-black">
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
                    </div>       {/* Original appointment history */}
                </details>       {/* Collapsible history */}
            </div>               {/* Main content container */}
        </main>
    );
}