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

type Employee = {
    id: number;
    name: string;
    active: boolean;
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
    const [employees, setEmployees] = useState<Employee[]>([]);

    const [reassigningAppointmentId, setReassigningAppointmentId] =
        useState<number | null>(null);

    const [reschedulingAppointmentId, setReschedulingAppointmentId] =
        useState<number | null>(null);

    const today = getTeffToday();

    // Load appointments so they can also be refreshed after reception changes.
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

    async function loadEmployees() {
        try {
            const response = await fetch("/api/employees");

            if (!response.ok) {
                throw new Error("No se pudieron cargar las técnicas");
            }

            const data = await response.json();
            setEmployees(data);
        } catch (error) {
            console.error(error);
        }
    }

    useEffect(() => {
        loadAppointments();
        loadEmployees();
    }, []);

    // Reassign an appointment to another qualified technician.
    async function reassignEmployee(
        appointmentId: number,
        employeeId: number
    ) {
        try {
            setReassigningAppointmentId(appointmentId);

            const response = await fetch(
                `/api/appointments/${appointmentId}/employee`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ employeeId }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                alert(data.error || "No se pudo cambiar la técnica");
                return;
            }

            // Reload appointments so reception immediately sees the new technician.
            await loadAppointments();
        } catch (error) {
            console.error(error);
            alert("No se pudo cambiar la técnica");
        } finally {
            setReassigningAppointmentId(null);
        }
    }

    // Change the date/time of one appointment block.
    async function rescheduleAppointment(
        appointmentId: number,
        date: string,
        startTime: string
    ) {
        try {
            setReschedulingAppointmentId(appointmentId);

            const response = await fetch(
                `/api/appointments/${appointmentId}/schedule`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        date,
                        startTime,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                alert(data.error || "No se pudo cambiar el horario");
                return;
            }

            // Reload so reception immediately sees the updated schedule.
            await loadAppointments();
        } catch (error) {
            console.error(error);
            alert("No se pudo cambiar el horario");
        } finally {
            setReschedulingAppointmentId(null);
        }
    }

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

    function getReceptionTimeOptions() {
        const options: string[] = [];

        // Covers TEFF's appointment start-time window.
        for (let minutes = 9 * 60 + 30; minutes <= 18 * 60; minutes += 30) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;

            options.push(
                `${hours.toString().padStart(2, "0")}:${mins
                    .toString()
                    .padStart(2, "0")}`
            );
        }

        return options;
    }

    const receptionTimeOptions = getReceptionTimeOptions();

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

                                    <div className="md:min-w-48 md:text-right">
                                        <p className="text-sm text-neutral-500">
                                            Técnica
                                        </p>

                                        <select
                                            value={appointment.employee.id}
                                            disabled={
                                                reassigningAppointmentId === appointment.id ||
                                                ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(
                                                    appointment.status
                                                )
                                            }
                                            onChange={(event) =>
                                                reassignEmployee(
                                                    appointment.id,
                                                    Number(event.target.value)
                                                )
                                            }
                                            className="mt-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
                                        >
                                            {employees.map((employee) => (
                                                <option
                                                    key={employee.id}
                                                    value={employee.id}
                                                >
                                                    {employee.name}
                                                </option>
                                            ))}
                                        </select>

                                        <p className="mt-2 text-sm text-neutral-500">
                                            {reassigningAppointmentId === appointment.id
                                                ? "Actualizando..."
                                                : getStatusLabel(appointment.status)}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 border-t border-neutral-200 pt-4">
                                    <p className="text-sm font-medium text-neutral-500">
                                        Cambiar horario
                                    </p>

                                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                        <input
                                            type="date"
                                            defaultValue={appointment.date.slice(0, 10)}
                                            disabled={
                                                reschedulingAppointmentId === appointment.id ||
                                                ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(
                                                    appointment.status
                                                )
                                            }
                                            id={`date-${appointment.id}`}
                                            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-black disabled:opacity-50"
                                        />

                                        <select
                                            defaultValue={appointment.startTime.slice(0, 5)}
                                            disabled={
                                                reschedulingAppointmentId === appointment.id ||
                                                ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(
                                                    appointment.status
                                                )
                                            }
                                            id={`time-${appointment.id}`}
                                            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-black disabled:opacity-50"
                                        >
                                            {!receptionTimeOptions.includes(
                                                appointment.startTime.slice(0, 5)
                                            ) && (
                                                <option value={appointment.startTime.slice(0, 5)}>
                                                    {formatTime(appointment.startTime)}
                                                </option>
                                            )}
                                            
                                            {receptionTimeOptions.map((time) => (
                                                <option key={time} value={time}>
                                                    {formatTime(time)}
                                                </option>
                                            ))}
                                        </select>

                                        <button
                                            type="button"
                                            disabled={
                                                reschedulingAppointmentId === appointment.id ||
                                                ["COMPLETED", "CANCELLED", "NO_SHOW"].includes(
                                                    appointment.status
                                                )
                                            }
                                            onClick={() => {
                                                const dateInput = document.getElementById(
                                                    `date-${appointment.id}`
                                                ) as HTMLInputElement;

                                                const timeInput = document.getElementById(
                                                    `time-${appointment.id}`
                                                ) as HTMLSelectElement;

                                                rescheduleAppointment(
                                                    appointment.id,
                                                    dateInput.value,
                                                    timeInput.value
                                                );
                                            }}
                                            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                        >
                                            {reschedulingAppointmentId === appointment.id
                                                ? "Actualizando..."
                                                : "Guardar horario"}
                                        </button>
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