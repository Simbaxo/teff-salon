"use client";

import { useEffect, useRef, useState } from "react";import Link from "next/link";
import {
    getTeffToday,
    hasTeffAppointmentStarted,
} from "@/lib/datetime";

type Appointment = {
    id: number;
    bookingId: number | null;
    employeeId: number;
    date: string;
    startTime: string;
    duration: number;
    status: string;
    notes: string | null;
    createdAt: string;

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

    monthlySalesTotal: number;
    monthlySalesGoal: number;
    monthlyGoalProgress: number;
    monthlyTechnicianSummary: WeeklyTechnicianSummary[];
};

type Employee = {
    id: number;
    name: string;
    active: boolean;
};

type ScheduleBlock = {
    id: number;
    employeeId: number;
    date: string;
    startTime: string;
    endTime: string;
    reason: string | null;

    employee: {
        id: number;
        name: string;
    };
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

function getStatusClasses(status: string) {
    switch (status) {
        case "BOOKED":
            return "bg-neutral-100 text-neutral-700";

        case "REQUESTED":
            return "bg-yellow-100 text-yellow-800";

        case "CHECKED_IN":
            return "bg-blue-100 text-blue-800";

        case "IN_PROGRESS":
            return "bg-purple-100 text-purple-800";

        case "COMPLETED":
            return "bg-green-100 text-green-800";

        case "CANCELLED":
        case "NO_SHOW":
            return "bg-red-100 text-red-800";

        default:
            return "bg-neutral-100 text-neutral-700";
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
    monthlySalesTotal,
    monthlySalesGoal,
    monthlyGoalProgress,
    monthlyTechnicianSummary,
}: ReceptionistPageClientProps) {
    const today = getTeffToday();

    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [employees, setEmployees] = useState<Employee[]>([]);

    const [reassigningAppointmentId, setReassigningAppointmentId] =
        useState<number | null>(null);

    const [reschedulingAppointmentId, setReschedulingAppointmentId] =
        useState<number | null>(null);

    // Track customer bookings already known to reception.
    // Multiple appointment blocks from the same booking count as one reservation.
    const knownBookingKeys = useRef<Set<string>>(new Set());
    const initialAppointmentsLoaded = useRef(false);

    const [newBookingCount, setNewBookingCount] = useState(0);

    const [scheduleBlocks, setScheduleBlocks] =
        useState<ScheduleBlock[]>([]);

    const [blockEmployeeId, setBlockEmployeeId] =
        useState<number>(0);

    const [blockDate, setBlockDate] = useState(today);

    const [blockStartTime, setBlockStartTime] =
        useState("09:30");

    const [blockEndTime, setBlockEndTime] =
        useState("10:30");

    const [blockReason, setBlockReason] = useState("");

    const [isSavingBlock, setIsSavingBlock] =
        useState(false);

    const [blockError, setBlockError] = useState("");

    // Load appointments and detect new customer reservations.
    async function loadAppointments(options?: {
        background?: boolean;
    }) {
        const background = options?.background ?? false;

        try {
            // Background polling should not replace the dashboard with a loading state.
            if (!background) {
                setIsLoading(true);
                setLoadError(false);
            }

            const response = await fetch("/api/appointments");

            // An expired session during background polling should fail quietly.
            // Normal page navigation/auth protection will handle access.
            if (response.status === 401) {
                return;
            }

            if (!response.ok) {
                throw new Error("No se pudieron cargar las citas");
            }

            const data: Appointment[] = await response.json();

            // One Booking may contain multiple appointment/service blocks.
            // Legacy appointments without a booking use their appointment ID.
            const bookingKeys = new Set(
                data.map((appointment) =>
                    appointment.bookingId !== null
                        ? `booking-${appointment.bookingId}`
                        : `appointment-${appointment.id}`
                )
            );

            // Existing bookings should not trigger alerts when reception first opens.
            if (!initialAppointmentsLoaded.current) {
                knownBookingKeys.current = bookingKeys;
                initialAppointmentsLoaded.current = true;
            } else {
                const newBookingKeys = [...bookingKeys].filter(
                    (key) => !knownBookingKeys.current.has(key)
                );

                if (newBookingKeys.length > 0) {
                    setNewBookingCount(
                        (current) =>
                            current + newBookingKeys.length
                    );
                }

                knownBookingKeys.current = bookingKeys;
            }

            setAppointments(data);
        } catch (error) {
            console.error(error);

            // A background refresh failure should not wipe out already-loaded data.
            if (!background) {
                setLoadError(true);
            }
        } finally {
            if (!background) {
                setIsLoading(false);
            }
        }
    }

    async function loadScheduleBlocks() {
        try {
            const response = await fetch("/api/schedule-blocks");

            if (!response.ok) {
                throw new Error(
                    "No se pudieron cargar los bloqueos"
                );
            }

            const data: ScheduleBlock[] =
                await response.json();

            setScheduleBlocks(data);
        } catch (error) {
            console.error(error);
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
        loadScheduleBlocks();

        // Refresh reception periodically so new customer bookings appear automatically.
        const interval = window.setInterval(() => {
            loadAppointments({ background: true });
        }, 30_000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

    async function createScheduleBlock() {
        setBlockError("");

        if (blockEmployeeId <= 0) {
            setBlockError("Selecciona una técnica.");
            return;
        }

        if (!blockDate) {
            setBlockError("Selecciona una fecha.");
            return;
        }

        if (blockStartTime >= blockEndTime) {
            setBlockError(
                "La hora final debe ser posterior a la hora inicial."
            );
            return;
        }

        try {
            setIsSavingBlock(true);

            const response = await fetch(
                "/api/schedule-blocks",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        employeeId: blockEmployeeId,
                        date: blockDate,
                        startTime: blockStartTime,
                        endTime: blockEndTime,
                        reason: blockReason,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "No se pudo bloquear el horario"
                );
            }

            setBlockReason("");
            setBlockError("");

            await loadScheduleBlocks();
        } catch (error) {
            setBlockError(
                error instanceof Error
                    ? error.message
                    : "No se pudo bloquear el horario"
            );
        } finally {
            setIsSavingBlock(false);
        }
    }

    async function deleteScheduleBlock(
        blockId: number
    ) {
        const confirmed = window.confirm(
            "¿Eliminar este bloqueo de horario?"
        );

        if (!confirmed) {
            return;
        }

        try {
            const response = await fetch(
                `/api/schedule-blocks/${blockId}`,
                {
                    method: "DELETE",
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "No se pudo eliminar el bloqueo"
                );
            }

            await loadScheduleBlocks();
        } catch (error) {
            alert(
                error instanceof Error
                    ? error.message
                    : "No se pudo eliminar el bloqueo"
            );
        }
    }

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

    // Update the operational status of an appointment.
    async function updateAppointmentStatus(
        appointmentId: number,
        status: string
    ) {
        try {
            const response = await fetch(
                `/api/appointments/${appointmentId}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ status }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                alert(data.error || "No se pudo actualizar la cita");
                return;
            }

            // Reload so KPIs and appointment cards stay synchronized.
            await loadAppointments();
        } catch (error) {
            console.error(error);
            alert("No se pudo actualizar la cita");
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
            <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
                <p className="font-semibold text-black">
                    Cargando citas...
                </p>

                <p className="mt-1 text-sm text-neutral-500">
                    Estamos actualizando la información de recepción.
                </p>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
                <p className="font-semibold text-red-700">
                    No se pudieron cargar las citas.
                </p>

                <p className="mt-1 text-sm text-neutral-500">
                    Verifica la conexión e intenta nuevamente.
                </p>

                <button
                    type="button"
                    onClick={() => loadAppointments()}
                    className="mt-4 rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white"
                >
                    Reintentar
                </button>
            </div>
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

    // A client can only be marked as a no-show after the appointment starts.
    function canMarkNoShow(date: string, startTime: string) {
        return hasTeffAppointmentStarted(date, startTime);
    }

    return (
        <div className="mt-8">

            {newBookingCount > 0 && (
                <div className="mb-6 flex flex-col gap-3 rounded-xl border border-neutral-300 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="font-bold text-black">
                            🔔 Nueva reserva
                        </p>

                        <p className="mt-1 text-sm text-neutral-600">
                            {newBookingCount === 1
                                ? "Se recibió una nueva reserva."
                                : `Se recibieron ${newBookingCount} nuevas reservas.`}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setNewBookingCount(0)}
                        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100"
                    >
                        Marcar como visto
                    </button>
                </div>
            )}

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

            {/* Technician schedule blocking */}
            <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold text-black">
                        Bloquear horario
                    </h2>

                    <p className="mt-1 text-sm text-neutral-500">
                        Marca períodos en los que una técnica no estará disponible.
                    </p>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                    <div>
                        <label className="block text-sm font-semibold text-black">
                            Técnica
                        </label>

                        <select
                            value={blockEmployeeId}
                            onChange={(event) =>
                                setBlockEmployeeId(
                                    Number(event.target.value)
                                )
                            }
                            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                        >
                            <option value={0}>
                                Seleccionar
                            </option>

                            {employees.map((employee) => (
                                <option
                                    key={employee.id}
                                    value={employee.id}
                                >
                                    {employee.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-black">
                            Fecha
                        </label>

                        <input
                            type="date"
                            value={blockDate}
                            onChange={(event) =>
                                setBlockDate(event.target.value)
                            }
                            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-black">
                            Desde
                        </label>

                        <select
                            value={blockStartTime}
                            onChange={(event) =>
                                setBlockStartTime(
                                    event.target.value
                                )
                            }
                            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                        >
                            {receptionTimeOptions.map((time) => (
                                <option key={time} value={time}>
                                    {formatTime(time)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-black">
                            Hasta
                        </label>

                        <select
                            value={blockEndTime}
                            onChange={(event) =>
                                setBlockEndTime(
                                    event.target.value
                                )
                            }
                            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                        >
                            {receptionTimeOptions.map((time) => (
                                <option key={time} value={time}>
                                    {formatTime(time)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-black">
                            Motivo
                        </label>

                        <input
                            type="text"
                            maxLength={200}
                            value={blockReason}
                            onChange={(event) =>
                                setBlockReason(event.target.value)
                            }
                            placeholder="Ej. Llega tarde"
                            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                        />
                    </div>
                </div>

                {blockError && (
                    <p className="mt-4 text-sm font-medium text-red-700">
                        {blockError}
                    </p>
                )}

                <button
                    type="button"
                    onClick={createScheduleBlock}
                    disabled={isSavingBlock}
                    className="mt-5 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                    {isSavingBlock
                        ? "Bloqueando..."
                        : "Bloquear horario"}
                </button>
            </div>

            {/* Schedule blocks for the selected block date */}
            <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-black">
                    Horarios bloqueados
                </h2>

                <p className="mt-1 text-sm text-neutral-500">
                    {blockDate}
                </p>

                {scheduleBlocks.filter(
                    (block) =>
                        block.date.slice(0, 10) === blockDate
                ).length === 0 ? (
                    <p className="mt-4 text-sm text-neutral-500">
                        No hay horarios bloqueados para esta fecha.
                    </p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {scheduleBlocks
                            .filter(
                                (block) =>
                                    block.date.slice(0, 10) ===
                                    blockDate
                            )
                            .map((block) => (
                                <div
                                    key={block.id}
                                    className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div>
                                        <p className="font-semibold text-black">
                                            {block.employee.name}
                                        </p>

                                        <p className="mt-1 text-sm text-neutral-600">
                                            {formatTime(block.startTime)}
                                            {" – "}
                                            {formatTime(block.endTime)}
                                        </p>

                                        {block.reason && (
                                            <p className="mt-1 text-sm text-neutral-500">
                                                {block.reason}
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            deleteScheduleBlock(
                                                block.id
                                            )
                                        }
                                        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            ))}
                    </div>
                )}
            </div>

            <div className="mt-8">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-black">
                        Citas de Hoy
                    </h2>

                    <span className="text-sm text-neutral-500">
                        {todaysAppointments.length}{" "}
                        {todaysAppointments.length === 1 ? "cita" : "citas"}
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

                                        <div className="mt-2">
                                            {reassigningAppointmentId === appointment.id ? (
                                                <span className="text-sm text-neutral-500">
                                                    Actualizando...
                                                </span>
                                            ) : (
                                                <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                                        appointment.status
                                                    )}`}
                                                >
                                                    {getStatusLabel(appointment.status)}
                                                </span>
                                            )}
                                        </div>
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
                                            className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black disabled:opacity-50"
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
                                            className="rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm text-black disabled:opacity-50"
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
                                            className="rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                                        >
                                            {reschedulingAppointmentId === appointment.id
                                                ? "Actualizando..."
                                                : "Guardar horario"}
                                        </button>
                                    </div>
                                </div>

                                {/* Appointment workflow actions */}
                                <div className="mt-4 border-t border-neutral-200 pt-4">
                                    {appointment.status === "REQUESTED" && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                updateAppointmentStatus(
                                                    appointment.id,
                                                    "BOOKED"
                                                )
                                            }
                                            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                                        >
                                            Confirmar Cita
                                        </button>
                                    )}

                                    {appointment.status === "BOOKED" && (
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    updateAppointmentStatus(
                                                        appointment.id,
                                                        "CHECKED_IN"
                                                    )
                                                }
                                                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                                            >
                                                Cliente Llegó
                                            </button>

                                            {canMarkNoShow(
                                                appointment.date,
                                                appointment.startTime
                                            ) && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const confirmed = window.confirm(
                                                            "¿Marcar esta cita como No Asistió?"
                                                        );

                                                        if (confirmed) {
                                                            updateAppointmentStatus(
                                                                appointment.id,
                                                                "NO_SHOW"
                                                            );
                                                        }
                                                    }}
                                                    className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                                                >
                                                    No Asistió
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const confirmed = window.confirm(
                                                        "¿Seguro que deseas cancelar esta cita?"
                                                    );

                                                    if (confirmed) {
                                                        updateAppointmentStatus(
                                                            appointment.id,
                                                            "CANCELLED"
                                                        );
                                                    }
                                                }}
                                                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black"
                                            >
                                                Cancelar Cita
                                            </button>
                                        </div>
                                    )}

                                    {appointment.status === "CHECKED_IN" && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                updateAppointmentStatus(
                                                    appointment.id,
                                                    "IN_PROGRESS"
                                                )
                                            }
                                            className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                                        >
                                            Iniciar Servicio
                                        </button>
                                    )}

                                    {appointment.status === "IN_PROGRESS" && (
                                        <Link
                                            href={`/staff/checkout/${appointment.id}`}
                                            className="inline-block rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                                        >
                                            Finalizar Servicio
                                        </Link>
                                    )}
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
                                    <Link
                                        href={`/receptionist/technicians/${employee.id}`}
                                        className="font-bold text-black hover:underline"
                                    >
                                        {employee.name}
                                    </Link>

                                    <p className="font-bold text-black">
                                        {formatCOP(employee.sales)}
                                    </p>
                                    <Link
                                        href={`/receptionist/technicians/${employee.id}`}
                                        className="mt-3 inline-block text-sm font-semibold text-black"
                                    >
                                        Ver actividad →
                                    </Link>
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

            {/* Monthly salon performance */}
            <div className="mt-8">
                <h2 className="text-xl font-bold text-black">
                    Este Mes
                </h2>

                {/* Monthly goal */}
                <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-neutral-500">
                                Ventas
                            </p>

                            <p className="mt-1 text-xl font-bold text-black">
                                {formatCOP(monthlySalesTotal)}
                            </p>
                        </div>

                        <div className="text-right">
                            <p className="text-sm font-medium text-neutral-500">
                                Meta Mensual
                            </p>

                            <p className="mt-1 text-xl font-bold text-black">
                                {formatCOP(monthlySalesGoal)}
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
                            {monthlyGoalProgress}% completado
                        </span>

                        <span>
                            Faltan{" "}
                            {formatCOP(
                                Math.max(
                                    monthlySalesGoal - monthlySalesTotal,
                                    0
                                )
                            )}
                        </span>
                    </div>
                </div>

                {/* Monthly technician production */}
                <div className="mt-6">
                    <h3 className="text-lg font-bold text-black">
                        Producción por Técnica
                    </h3>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        {monthlyTechnicianSummary.map((employee) => (
                            <div
                                key={employee.id}
                                className="rounded-xl bg-white p-5 shadow-sm"
                            >
                                <div className="flex items-center justify-between">
                                    <Link
                                        href={`/receptionist/technicians/${employee.id}`}
                                        className="font-bold text-black hover:underline"
                                    >
                                        {employee.name}
                                    </Link>

                                    <p className="font-bold text-black">
                                        {formatCOP(employee.sales)}
                                    </p>
                                    <Link
                                        href={`/receptionist/technicians/${employee.id}`}
                                        className="mt-3 inline-block text-sm font-semibold text-black"
                                    >
                                        Ver actividad →
                                    </Link>
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