"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTeffToday } from "@/lib/datetime";

type Appointment = {
    id: number;
    bookingId: number | null;
    employeeId: number;
    date: string;
    startTime: string;
    duration: number;
    status: string;
    notes: string | null;

    customer: {
        id: number;
        name: string;
        phone: string;
        email: string | null;
    };

    employee: {
        id: number;
        name: string;
    };

    appointmentServices: {
        bookedPrice: number;
        bookedDuration: number;
        service: {
            id: number;
            nameEs: string;
            nameEn: string;
        };
    }[];

    appointmentAddons: {
        bookedPrice: number;
        bookedDuration: number;
        addon: {
            id: number;
            nameEs: string;
            nameEn: string;
        };
    }[];
};

type WeeklyTechnicianSummary = {
    id: number;
    name: string;
    sales: number;
    customers: number;
};

type ReceptionistPageClientProps = {
    todaysSalesTotal: number;
    weeklySalesTotal: number;
    weeklySalesGoal: number;
    weeklyGoalProgress: number;
    weeklyTechnicianSummary: WeeklyTechnicianSummary[];
};

function getStatusLabel(status: string) {
    switch (status) {
        case "BOOKED":
            return "Reservada";
        case "REQUESTED":
            return "Pendiente";
        case "CHECKED_IN":
            return "Cliente llegó";
        case "IN_PROGRESS":
            return "En servicio";
        case "COMPLETED":
            return "Completada";
        case "CANCELLED":
            return "Cancelada";
        case "NO_SHOW":
            return "No asistió";
        default:
            return status;
    }
}

function formatTime(time: string) {
    const [hours, minutes] = time.split(":").map(Number);

    const period = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;

    return `${displayHour}:${minutes
        .toString()
        .padStart(2, "0")} ${period}`;
}

function formatCOP(value: number) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
    }).format(value);
}

export default function ReceptionistPageClient({
    todaysSalesTotal,
    weeklySalesTotal,
    weeklySalesGoal,
    weeklyGoalProgress,
    weeklyTechnicianSummary,
}: ReceptionistPageClientProps) {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);

    const today = getTeffToday();

    useEffect(() => {
        async function loadAppointments() {
            try {
                setIsLoading(true);
                setLoadError(false);

                const response = await fetch("/api/appointments");

                if (!response.ok) {
                    throw new Error("No se pudieron cargar las citas");
                }

                const data = await response.json();

                setAppointments(data);
            } catch (error) {
                console.error(error);
                setLoadError(true);
            } finally {
                setIsLoading(false);
            }
        }

        loadAppointments();
    }, []);

    const todaysAppointments = appointments
        .filter(
            (appointment) =>
                appointment.date.slice(0, 10) === today
        )
        .sort((a, b) =>
            a.startTime.localeCompare(b.startTime)
        );
    
    // Reception snapshot for today's salon activity.
    const todaysAppointmentCount = todaysAppointments.filter(
        (appointment) =>
            !["CANCELLED", "NO_SHOW"].includes(appointment.status)
    ).length;

    const todaysCompletedCustomers = new Set(
        todaysAppointments
            .filter(
                (appointment) =>
                    appointment.status === "COMPLETED"
            )
            .map((appointment) => appointment.customer.id)
    ).size;

    const todaysInService = todaysAppointments.filter(
        (appointment) =>
            appointment.status === "IN_PROGRESS"
    ).length;

    if (isLoading) {
        return (
            <p className="mt-8 text-neutral-500">
                Cargando citas...
            </p>
        );
    }

    if (loadError) {
        return (
            <p className="mt-8 text-red-600">
                No se pudieron cargar las citas.
            </p>
        );
    }

    return (
        <div className="mt-8">

            {/* Today's reception snapshot */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-neutral-500">
                        Citas de Hoy
                    </p>

                    <p className="mt-2 text-2xl font-bold text-black">
                        {todaysAppointmentCount}
                    </p>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-neutral-500">
                        Clientes Atendidos
                    </p>

                    <p className="mt-2 text-2xl font-bold text-black">
                        {todaysCompletedCustomers}
                    </p>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-neutral-500">
                        En Servicio
                    </p>

                    <p className="mt-2 text-2xl font-bold text-black">
                        {todaysInService}
                    </p>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-neutral-500">
                        Ventas de Hoy
                    </p>

                    <p className="mt-2 text-2xl font-bold text-black">
                        {formatCOP(todaysSalesTotal)}
                    </p>
                </div>
            </div>

            <div className="mt-8">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-black">
                        Citas de Hoy
                    </h2>

                    <span className="text-sm text-neutral-500">
                        {todaysAppointments.length} citas
                    </span>
                </div>

                {todaysAppointments.length === 0 ? (
                    <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-neutral-500">
                            No hay citas programadas para hoy.
                        </p>
                    </div>
                ) : (
                    <div className="mt-4 space-y-3">
                        {todaysAppointments.map((appointment) => (
                            <div
                                key={appointment.id}
                                className="rounded-xl bg-white p-5 shadow-sm"
                            >
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-lg font-bold text-black">
                                            {formatTime(appointment.startTime)}
                                        </p>

                                        <Link
                                            href={`/staff/customers/${appointment.customer.id}`}
                                            className="mt-1 inline-block font-semibold text-black hover:underline"
                                        >
                                            {appointment.customer.name}
                                        </Link>

                                        <p className="mt-1 text-sm text-neutral-500">
                                            {appointment.appointmentServices
                                                .map(
                                                    (item) =>
                                                        item.service.nameEs
                                                )
                                                .join(", ")}
                                        </p>
                                    </div>

                                    <div className="md:text-right">
                                        <p className="font-semibold text-black">
                                            {appointment.employee.name}
                                        </p>

                                        <p className="mt-1 text-sm text-neutral-500">
                                            {getStatusLabel(appointment.status)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Weekly salon performance */}
            <div className="mt-8">
                <h2 className="text-xl font-bold text-black">
                    Esta Semana
                </h2>

                {/* Weekly goal */}
                <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-neutral-500">
                                Ventas
                            </p>

                            <p className="mt-1 text-xl font-bold text-black">
                                {formatCOP(weeklySalesTotal)}
                            </p>
                        </div>

                        <div className="text-right">
                            <p className="text-sm font-medium text-neutral-500">
                                Meta Semanal
                            </p>

                            <p className="mt-1 text-xl font-bold text-black">
                                {formatCOP(weeklySalesGoal)}
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
                            {weeklyGoalProgress}% completado
                        </span>

                        <span>
                            Faltan{" "}
                            {formatCOP(
                                Math.max(
                                    weeklySalesGoal - weeklySalesTotal,
                                    0
                                )
                            )}
                        </span>
                    </div>
                </div>

                {/* Technician production */}
                <div className="mt-6">
                    <h3 className="text-lg font-bold text-black">
                        Producción por Técnica
                    </h3>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {weeklyTechnicianSummary.map((employee) => (
                            <div
                                key={employee.id}
                                className="rounded-xl bg-white p-5 shadow-sm"
                            >
                                <div className="flex items-center justify-between">
                                    <p className="font-bold text-black">
                                        {employee.name}
                                    </p>

                                    <p className="font-bold text-black">
                                        {formatCOP(employee.sales)}
                                    </p>
                                </div>

                                <p className="mt-2 text-sm text-neutral-500">
                                    {employee.customers}{" "}
                                    {employee.customers === 1
                                        ? "cliente"
                                        : "clientes"}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}