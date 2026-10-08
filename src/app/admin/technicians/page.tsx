import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
import AdminNav from "@/components/AdminNav";
import { prisma } from "@/lib/prisma";
import {
    addTeffDays,
    getTeffDayOfWeek,
    getTeffDayStart,
    getTeffToday,
} from "@/lib/datetime";

type DateRange = "TODAY" | "WEEK" | "MONTH" | "CUSTOM";

type TechniciansPageProps = {
    searchParams: Promise<{
        range?: string;
        from?: string;
        to?: string;
    }>;
};

export default async function TechniciansPage({
        searchParams,
    }: TechniciansPageProps) {
    const session = await auth();

    // Individual financial reporting is OWNER-only
    if (
        !session?.user ||
        session.user.role !== "OWNER"
    ) {
        redirect("/login");
    }

    // Read the selected reporting period from the URL.
    const params = await searchParams;

    const validRanges: DateRange[] = [
        "TODAY",
        "WEEK",
        "MONTH",
        "CUSTOM",
    ];

    const range: DateRange = validRanges.includes(
        params.range as DateRange
    )
        ? (params.range as DateRange)
        : "WEEK";

    const today = getTeffToday();

    const dayOfWeek = getTeffDayOfWeek(today);

    const daysSinceMonday =
        dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const weekStartDate = addTeffDays(
        today,
        -daysSinceMonday
    );

    // Validate calendar dates before querying the database.
    function isValidDate(value: string | undefined) {
        if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return false;
        }

        const parsed = new Date(`${value}T00:00:00Z`);

        return (
            !Number.isNaN(parsed.getTime()) &&
            parsed.toISOString().slice(0, 10) === value
        );
    }

    let fromDate: string;
    let toDate: string; // Inclusive calendar date.

    switch (range) {
        case "TODAY":
            fromDate = today;
            toDate = today;
            break;

        case "MONTH":
            fromDate = `${today.slice(0, 7)}-01`;
            toDate = today;
            break;

        case "CUSTOM":
            fromDate = isValidDate(params.from)
                ? params.from!
                : today;

            toDate = isValidDate(params.to)
                ? params.to!
                : today;
            break;

        case "WEEK":
        default:
            fromDate = weekStartDate;
            toDate = today;
            break;
    }

    // Prevent reversed date ranges.
    if (fromDate > toDate) {
        [fromDate, toDate] = [toDate, fromDate];
    }

    // Filter by Appointment.date: when the service was performed.
    const periodStart = getTeffDayStart(fromDate);

    const periodEnd = getTeffDayStart(
        addTeffDays(toDate, 1)
    );

    const periodLabel = {
        TODAY: "Hoy",
        WEEK: "Esta Semana",
        MONTH: "Este Mes",
        CUSTOM: "Rango Personalizado",
    }[range];

    // Load active technicians, including those with no sales.
    const technicians = await prisma.employee.findMany({
        where: {
            active: true,
        },
        orderBy: {
            name: "asc",
        },
        select: {
            id: true,
            name: true,
        },
    });

    // Load commissions earned for services performed in the period.
    const commissions = await prisma.commission.findMany({
        where: {
            sale: {
                saleAppointments: {
                    some: {
                        appointment: {
                            date: {
                                gte: periodStart,
                                lt: periodEnd,
                            },
                        },
                    },
                },
            },
        },
        select: {
            employeeId: true,
            saleId: true,
            commissionBase: true,
            commissionAmount: true,
            status: true,
            sale: {
                select: {
                    id: true,
                    saleAppointments: {
                        select: {
                            appointment: {
                                select: {
                                    employeeId: true,
                                    date: true,
                                    startTime: true,
                                    customer: {
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
            },
        },
    });

    // Load tips using the technician's actual service date.
    const tips = await prisma.tip.findMany({
        where: {
            sale: {
                saleAppointments: {
                    some: {
                        appointment: {
                            date: {
                                gte: periodStart,
                                lt: periodEnd,
                            },
                        },
                    },
                },
            },
        },

        select: {
            employeeId: true,
            amount: true,
            status: true,

            sale: {
                select: {
                    id: true,

                    saleAppointments: {
                        select: {
                            appointment: {
                                select: {
                                    employeeId: true,
                                    date: true,
                                    startTime: true,

                                    customer: {
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
            },
        },
    });

    // Include a financial record only when this technician
    // actually worked during the selected service-date period.
    function workedInPeriod(
        employeeId: number,
        appointments: {
            appointment: {
                employeeId: number;
                date: Date;
            };
        }[]
    ) {
        return appointments.some(
            ({ appointment }) =>
                appointment.employeeId === employeeId &&
                appointment.date >= periodStart &&
                appointment.date < periodEnd
        );
    }

    const technicianSummaries = technicians.map(
        (technician) => {
            const employeeCommissions =
                commissions.filter(
                    (commission) =>
                        commission.employeeId === technician.id &&
                        workedInPeriod(
                            technician.id,
                            commission.sale.saleAppointments
                        )
                );

            const employeeTips = tips.filter(
                (tip) =>
                    tip.employeeId === technician.id &&
                    workedInPeriod(
                        technician.id,
                        tip.sale.saleAppointments
                    )
            );

            const production =
                employeeCommissions.reduce(
                    (sum, commission) =>
                        sum + commission.commissionBase,
                    0
                );

            const commissionTotal =
                employeeCommissions.reduce(
                    (sum, commission) =>
                        sum + commission.commissionAmount,
                    0
                );

            const pendingCommission =
                employeeCommissions
                    .filter(
                        (commission) =>
                            commission.status === "PENDING"
                    )
                    .reduce(
                        (sum, commission) =>
                            sum + commission.commissionAmount,
                        0
                    );

            const tipsTotal = employeeTips.reduce(
                (sum, tip) => sum + tip.amount,
                0
            );

            const transactionCount = new Set(
                employeeCommissions.map(
                    (commission) => commission.saleId
                )
            ).size;

            // Group commission records by sale to avoid duplicate activity rows.
            const activityBySale = new Map<
                number,
                {
                    saleId: number;
                    serviceDate: Date | null;
                    startTime: string;
                    customerName: string;
                    production: number;
                    commission: number;
                    tips: number;
                }
            >();

            for (const commission of employeeCommissions) {
                const appointment =
                    commission.sale.saleAppointments
                        .map((item) => item.appointment)
                        .filter(
                            (item) =>
                                item.employeeId === technician.id &&
                                item.date >= periodStart &&
                                item.date < periodEnd
                        )
                        .sort((a, b) =>
                            a.startTime.localeCompare(b.startTime)
                        )[0];

                const existing = activityBySale.get(commission.saleId);

                if (existing) {
                    existing.production += commission.commissionBase;
                    existing.commission += commission.commissionAmount;
                } else {
                    activityBySale.set(commission.saleId, {
                        saleId: commission.saleId,
                        serviceDate: appointment?.date ?? null,
                        startTime: appointment?.startTime ?? "",
                        customerName: appointment?.customer.name ?? "Cliente",
                        production: commission.commissionBase,
                        commission: commission.commissionAmount,
                        tips: 0,
                    });
                }
            }

            // Add each tip once to its technician's sale.
            for (const tip of employeeTips) {
                const row = activityBySale.get(tip.sale.id);

                if (row) {
                    row.tips += tip.amount;
                }
            }

            const activity = Array.from(activityBySale.values()).sort(
                (a, b) => {
                    const dateDifference =
                        (b.serviceDate?.getTime() ?? 0) -
                        (a.serviceDate?.getTime() ?? 0);

                    return dateDifference !== 0
                        ? dateDifference
                        : b.startTime.localeCompare(a.startTime);
                }
            );

            return {
                id: technician.id,
                name: technician.name,
                production,
                commissionTotal,
                pendingCommission,
                tipsTotal,
                transactionCount,
                activity,
            };
        }
    );

    const formatCOP = (value: number) =>
        new Intl.NumberFormat("es-CO", {
            style: "currency",
            currency: "COP",
            maximumFractionDigits: 0,
        }).format(value);
    
    const formatServiceDate = (value: Date | null) => {
        if (!value) return "Fecha no disponible";

        return new Intl.DateTimeFormat("es-CO", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
        }).format(value);
    };

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-6xl">
                <h1 className="text-3xl font-bold text-black">
                    Panel del Propietario
                </h1>

                <p className="mt-2 text-neutral-600">
                    Consulta la actividad y producción
                    individual de las técnicas.
                </p>

                <div className="mt-4">
                    <InternalNav
                        userRole={session.user.role}
                    />
                </div>

                <div className="mt-6">
                    <AdminNav />
                </div>

                <section className="mt-8">
                    <h2 className="text-2xl font-bold text-black">
                        Técnicas
                    </h2>

                    <p className="mt-2 text-neutral-500">
                        Producción, clientes atendidos,
                        comisiones y propinas por técnica.
                    </p>
                </section>

                {/* Reporting period navigation */}
                <div className="mt-6 flex flex-wrap gap-2">
                    {[
                        { value: "TODAY", label: "Hoy" },
                        { value: "WEEK", label: "Esta Semana" },
                        { value: "MONTH", label: "Este Mes" },
                        { value: "CUSTOM", label: "Rango" },
                    ].map((option) => {
                        const active = range === option.value;

                        return (
                            <a
                                key={option.value}
                                href={
                                    option.value === "CUSTOM"
                                        ? `/admin/technicians?range=CUSTOM&from=${fromDate}&to=${toDate}`
                                        : `/admin/technicians?range=${option.value}`
                                }
                                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                                    active
                                        ? "bg-[#B76E79] text-white"
                                        : "bg-white text-black hover:bg-neutral-100"
                                }`}
                            >
                                {option.label}
                            </a>
                        );
                    })}
                </div>

                {/* Custom date range */}
                {range === "CUSTOM" && (
                    <form
                        action="/admin/technicians"
                        method="GET"
                        className="mt-4 grid gap-4 rounded-xl bg-white p-4 sm:grid-cols-3"
                    >
                        <input
                            type="hidden"
                            name="range"
                            value="CUSTOM"
                        />

                        <div>
                            <label
                                htmlFor="from"
                                className="block text-sm font-semibold text-black"
                            >
                                Desde
                            </label>

                            <input
                                id="from"
                                name="from"
                                type="date"
                                defaultValue={fromDate}
                                required
                                className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-black"
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="to"
                                className="block text-sm font-semibold text-black"
                            >
                                Hasta
                            </label>

                            <input
                                id="to"
                                name="to"
                                type="date"
                                defaultValue={toDate}
                                required
                                className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-black"
                            />
                        </div>

                        <div className="flex items-end">
                            <button
                                type="submit"
                                className="w-full rounded-lg bg-[#B76E79] px-4 py-2 font-semibold text-white"
                            >
                                Aplicar
                            </button>
                        </div>
                    </form>
                )}

                <section className="mt-6 grid gap-4 md:grid-cols-2">
                    {technicianSummaries.map((technician) => (
                        <div
                            key={technician.id}
                            className="rounded-xl bg-white p-5 shadow-sm"
                        >
                            <h3 className="text-xl font-bold text-black">
                                {technician.name}
                            </h3>

                            <p className="mt-1 text-sm text-neutral-500">
                                Producción · {periodLabel}
                            </p>

                            <div className="mt-5 grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-neutral-500">
                                        Producción
                                    </p>
                                    <p className="mt-1 text-xl font-bold text-black">
                                        {formatCOP(technician.production)}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        Transacciones
                                    </p>
                                    <p className="mt-1 text-xl font-bold text-black">
                                        {technician.transactionCount}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        Comisiones
                                    </p>
                                    <p className="mt-1 text-xl font-bold text-black">
                                        {formatCOP(technician.commissionTotal)}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm text-neutral-500">
                                        Propinas
                                    </p>
                                    <p className="mt-1 text-xl font-bold text-black">
                                        {formatCOP(technician.tipsTotal)}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 border-t border-neutral-200 pt-4">
                                <div className="flex justify-between gap-4 text-sm">
                                    <span className="text-neutral-500">
                                        Comisión Pendiente
                                    </span>

                                    <span className="font-semibold text-black">
                                        {formatCOP(technician.pendingCommission)}
                                    </span>
                                </div>
                            </div>

                            {/* Expandable transaction history */}
                            <details className="group mt-5 border-t border-neutral-200 pt-4">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#B76E79]">
                                    <span className="group-open:hidden">
                                        Ver Actividad ({technician.activity.length})
                                    </span>

                                    <span className="hidden group-open:inline">
                                        Ocultar Actividad
                                    </span>

                                    <span className="text-lg group-open:rotate-180">
                                        ⌄
                                    </span>
                                </summary>

                                <div className="mt-4 space-y-3">
                                    {technician.activity.length === 0 ? (
                                        <p className="text-sm text-neutral-500">
                                            No hay actividad para el período seleccionado.
                                        </p>
                                    ) : (
                                        technician.activity.map((item) => (
                                            <div
                                                key={item.saleId}
                                                className="rounded-xl bg-neutral-50 p-4"
                                            >
                                                <div className="flex flex-wrap items-start justify-between gap-3">
                                                    <div>
                                                        <p className="font-semibold text-black">
                                                            {item.customerName}
                                                        </p>

                                                        <p className="mt-1 text-xs text-neutral-500">
                                                            {formatServiceDate(item.serviceDate)}
                                                            {item.startTime &&
                                                                ` · ${item.startTime}`}
                                                        </p>
                                                    </div>

                                                    <a
                                                        href={`/sales?saleId=${item.saleId}`}
                                                        className="text-sm font-semibold text-[#B76E79] hover:underline"
                                                    >
                                                        Venta #{item.saleId}
                                                    </a>
                                                </div>

                                                <div className="mt-4 grid grid-cols-3 gap-3">
                                                    <div>
                                                        <p className="text-xs text-neutral-500">
                                                            Producción
                                                        </p>

                                                        <p className="mt-1 text-sm font-bold text-black">
                                                            {formatCOP(item.production)}
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs text-neutral-500">
                                                            Comisión
                                                        </p>

                                                        <p className="mt-1 text-sm font-bold text-black">
                                                            {formatCOP(item.commission)}
                                                        </p>
                                                    </div>

                                                    <div>
                                                        <p className="text-xs text-neutral-500">
                                                            Propina
                                                        </p>

                                                        <p className="mt-1 text-sm font-bold text-black">
                                                            {formatCOP(item.tips)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </details>
                        </div>
                    ))}
                </section>
            </div>
        </main>
    );
}