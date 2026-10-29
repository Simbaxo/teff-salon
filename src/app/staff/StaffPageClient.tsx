"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  getTeffToday,
  hasTeffAppointmentStarted,
} from "@/lib/datetime";
import {
    getUniqueFinalizedSales,
} from "@/lib/appointments/get-unique-finalized-sales";
import {
    classifyFinalizedSaleItems,
} from "@/lib/appointments/classify-finalized-sale-items";
import InternalNav from "@/components/InternalNav";

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
    }

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
    // Finalized checkout data, available only from the staff API.
    saleAppointments: {
        sale: {
            id: number;
            finalTotal: number;

            lineItems: {
                id: number;
                itemType: string;
                itemName: string;
                unitPrice: number;
                employeeId: number | null;
                appointmentId: number | null;
                parentLineItemId: number | null;
            }[];

            saleAppointments: {
                appointment: {
                    id: number,
                    customerId: number;
                };
            }[];
        };
    }[];
};

type Employee = {
    id: number;
    name: string;
    active: boolean;
}

type StaffPageClientProps = {
    userName: string;
    userRole: "OWNER" | "RECEPTIONIST" | "TECHNICIAN";
}

// Translate Appointment Status to Spanish
function getStatusLabel(status: string){
    switch (status) {
        case "BOOKED":
            return "Reservada";
        case "REQUESTED":
            return "Pendiente"
        case "COMPLETED":
            return "Completada";
        case "CANCELLED":
            return "Cancelada";
        case "NO_SHOW":
            return "No Asistió";
        case "CHECKED_IN":
            return "Cliente llego";
        case "IN_PROGRESS":
            return "En servicio";
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

// A client can only be marked as a no-show after the appointment starts.
function canMarkNoShow(date: string, startTime: string) {
    return hasTeffAppointmentStarted(date, startTime)
}

// Display appointment times in customer/staff-friendly AM/PM format
function formatTime(time: string) {
    const [hours, minutes] = time.split(":").map(Number);

    const period = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;

    return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;

}

function getStaffTimeOptions() {
    const options: string[] = [];

    // Covers the full TEFF operating window.
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

const staffTimeOptions = getStaffTimeOptions();

export default  function StaffPage({
    userName,
    userRole,
}: StaffPageClientProps) {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    // Active technicians available for appointment reassignment
    const [employees, setEmployees] = useState<Employee[]>([]);
    // Track which appointment is currently being reassigned
    const [reassigningAppointmentId, setReassigningAppointmentId] =
        useState<number | null>(null);
    // Track which individual service block is being rescheduled.
    const [reschedulingAppointmentId, setReschedulingAppointmentId] =
    useState<number | null>(null);
    // Track whether the staff appointment data is still loading.
    const [isLoading, setIsLoading] = useState(true);
    // Show a useful message if appointment data cannot be loaded.
    const [loadError, setLoadError] = useState(false);
    // Track expanded reservations independently for each technician.
    const [expandedBookingGroups, setExpandedBookingGroups] =
        useState<string[]>([]);
    // Default the staff calendar to today's date in Medellin.
    const [selectedDate, setSelectedDate] = useState(
        getTeffToday()
    );

    // Load The Appointments from the Staff API
    async function loadAppointments() {
        try {
            setIsLoading(true);
            setLoadError(false);

            const response = await fetch("/api/appointments");

            if (!response.ok) {
                throw new Error("No se pudieron cargar las citas")
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

    // Load active technicians for appointment reassignment
    async function loadEmployees() {
        try {
            const response = await fetch("/api/employees");

            if (!response.ok) {
                throw new Error("No se pudieron cargar las técnicas");
            }

            const data = await response.json();
            setEmployees(data);
        } catch (error) {
            console.error(error)
        }
    }

    useEffect(() => {
        loadAppointments();
        loadEmployees();
   }, []);

    // Create the Filtered Appointments
    const appointmentsForDate = appointments.filter(
        (appointment) =>
            appointment.date.slice(0, 10) === selectedDate
    );

    // Collect finalized sales once for the selected agenda date.
    // Multiple appointment blocks may reference the same sale.
    // This does not modify the original appointment information.
    const finalizedSalesForDate = getUniqueFinalizedSales(
        appointmentsForDate
    );

    // Classify each finalized service exactly once.
    // Keep appointment-linked items separate from items whose
    // individual appointment ownership cannot be verified.
    const classifiedFinalizedSales = finalizedSalesForDate.map(
        (sale) => {
            const classification = classifyFinalizedSaleItems(
                sale,
                appointmentsForDate
            );

            return {
                ...sale,
                assignedItems: classification.assignedItems,
                unassignedItems: classification.unassignedItems,
            };
        }
    );

    // Count how many appointment blocks belong to the same customer booking
    function getBookingAppointmentCount(bookingId: number | null) {
        if (bookingId === null) {
            return 1;
        }

        return appointmentsForDate.filter(
            (appointment) => appointment.bookingId === bookingId
        ).length;
    }

    function getBookingAppointmentPosition(
        appointmentId: number,
        bookingId: number | null
    ) {
        if (bookingId === null) {
            return null;
        }

        const bookingAppointments = appointmentsForDate
            .filter(
                (appointment) =>
                    appointment.bookingId === bookingId
            )
            .sort((a, b) =>
                a.startTime.localeCompare(b.startTime)
            );

        const index = bookingAppointments.findIndex(
            (appointment) =>
                appointment.id === appointmentId
        );

        return index >= 0 ? index + 1 : null;
    }

    // Group Appointments by Technician
    const appointmentsByEmployee = appointmentsForDate.reduce(
        (groups, appointment) => {
            const employeeName = appointment.employee.name;

            if (!groups[employeeName]) {
                groups[employeeName] = [];
            }

            groups[employeeName].push(appointment)

            return groups;
        },
        {} as Record<string, Appointment[]>
    );

    // Group each technician's appointments by reservation.
    // Appointments without a booking ID remain independent.
    const reservationGroupsByEmployee = Object.fromEntries(
        Object.entries(appointmentsByEmployee).map(
            ([employeeName, employeeAppointments]) => {
                const groups = new Map<string, Appointment[]>();

                const sortedAppointments = [...employeeAppointments].sort(
                    (a, b) => a.startTime.localeCompare(b.startTime)
                );

                for (const appointment of sortedAppointments) {
                    const groupKey =
                        appointment.bookingId !== null
                            ? `booking-${appointment.bookingId}`
                            : `appointment-${appointment.id}`;

                    if (!groups.has(groupKey)) {
                        groups.set(groupKey, []);
                    }

                    groups.get(groupKey)!.push(appointment);
                }

                return [
                    employeeName,
                    Array.from(groups, ([key, groupAppointments]) => ({
                        key,
                        bookingId: groupAppointments[0].bookingId,
                        customer: groupAppointments[0].customer,
                        appointments: groupAppointments,
                    })),
                ];
            }
        )
    ) as Record<
        string,
        {
            key: string;
            bookingId: number | null;
            customer: Appointment["customer"];
            appointments: Appointment[];
        }[]
    >;

    // Add the status update function
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

            if (!response.ok) {
                throw new Error("No se pudo actualizar la cita");
            }

            setAppointments((current) =>
                current.map((appointment) =>
                    appointment.id === appointmentId
                        ? {...appointment, status }
                        : appointment
                )
            );
        } catch (error) {
            console.error(error);
        }
    }

    // Reassign an appointment to another qualified technician.
    // Appointment overlaps can be intentionally overridden after confirmation.
    async function reassignEmployee(
        appointmentId: number,
        employeeId: number
    ) {
        try {
            setReassigningAppointmentId(appointmentId);

            async function sendReassignmentRequest(overrideOverlap = false) {
                const response = await fetch(
                    `/api/appointments/${appointmentId}/employee`,
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            employeeId,
                            overrideOverlap,
                        }),
                    }
                );

                const data = await response.json();

                return {
                    response,
                    data,
                };
            }

            // First attempt keeps normal overlap protection enabled.
            let { response, data } = await sendReassignmentRequest();

            // If the new technician already has another appointment,
            // staff may intentionally override the overlap.
            if (
                response.status === 409 &&
                data.conflictType === "APPOINTMENT"
            ) {
                const confirmed = window.confirm(
                    "Esta técnica ya tiene otra cita durante este horario.\n\n¿Deseas asignar la cita de todas formas?"
                );

                if (!confirmed) {
                    return;
                }

                // Retry only after explicit confirmation.
                ({ response, data } =
                    await sendReassignmentRequest(true));
            }

            if (!response.ok) {
                if (
                    response.status === 409 &&
                    data.conflictType === "SCHEDULE_BLOCK"
                ) {
                    alert(
                        "La técnica tiene un bloqueo de horario durante este período."
                    );
                    return;
                }

                alert(data.error || "No se pudo cambiar la técnica");
                return;
            }

            // Reload so the appointment moves to the correct technician.
            await loadAppointments();
        } catch (error) {
            console.error(error);
            alert("No se pudo cambiar la técnica");
        } finally {
            setReassigningAppointmentId(null);
        }
    }

    // Change the schedule of one appointment block without changing
    // the other services that belong to the same customer booking
    // Appointment overlaps can be intentionally overridden after confirmation
    async function rescheduleAppointment(
        appointmentId: number,
        date: string,
        startTime: string
    ) {
        try {
            setReschedulingAppointmentId(appointmentId);

            async function sendRescheduleRequest(overrideOverlap = false) {
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
                            overrideOverlap,
                        }),
                    }
                );

                const data = await response.json();

                return {
                    response,
                    data,
                };
            }

            // First attempt keeps normal overlap protection enabled.
            let { response, data } = await sendRescheduleRequest();

            // Staff may intentionally override another appointment overlap.
            if (
                response.status === 409 &&
                data.conflictType === "APPOINTMENT"
            ) {
                const confirmed = window.confirm(
                    "Este horario se superpone con otra cita.\n\n¿Deseas guardar la cita de todas formas?"
                );

                if (!confirmed) {
                    return;
                }

                // Retry only after explicit confirmation.
                ({ response, data } =
                    await sendRescheduleRequest(true));
            }

            if (!response.ok) {
                if (
                    response.status === 409 &&
                    data.conflictType === "SCHEDULE_BLOCK"
                ) {
                    alert(
                        "La técnica tiene un bloqueo de horario durante este período."
                    );
                    return;
                }

                alert(data.error || "No se pudo cambiar el horario");
                return;
            }

            // Reload so technician columns and appointment times stay synchronized.
            await loadAppointments();
        } catch (error) {
            console.error(error);
            alert("No se pudo cambiar el horario");
        } finally {
            setReschedulingAppointmentId(null);
        }
    }

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-5xl">
                {/* Staff page header */}
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-black">
                            TEFF Staff
                        </h1>

                        <p className="mt-2 text-neutral-600">
                            Gestión de Citas
                        </p>
                        {/* Show the authenticated TEFF account */}
                        <p className="mt-1 text-sm text-neutral-500">
                            {userName} · {userRole}
                        </p>

                        <div className="mt-4">
                            <InternalNav userRole={userRole} />
                        </div>
                    </div>

                    <button
                        onClick={() => signOut({ callbackUrl: "/login"})}
                        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100"
                    >
                        Cerrar sesión
                    </button>
                </div>
                <div className="mt-6">
                    <label
                        htmlFor="staff-date"
                        className="block text-sm font-semibold text-black"
                    >
                        Fecha
                    </label>

                    <input
                        id="staff-date"
                        type="date"
                        value={selectedDate}
                        onChange={(event) => setSelectedDate(event.target.value)}
                        className="mt-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                    />
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                    <Link
                        href="/staff/historical"
                        className="inline-flex rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                        + Registrar servicio anterior
                    </Link>

                    <Link
                        href="/staff/upcoming"
                        className="inline-flex rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-100"
                    >
                        📅 Ver próximas citas
                    </Link>
                </div>

                <div className="mt-8 space-y-4">
                    {isLoading && (
                        <p className="text-sm text-neutral-600">
                            Cargando Citas...
                        </p>
                    )}

                    {loadError && (
                        <div className="space-y-2">
                            <p className="text-sm text-red-600">
                                No se pudieron cargar las citas. Intenta nuevamente.
                            </p>

                            <button
                                onClick={loadAppointments}
                                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black"
                            >
                                Reintentar
                            </button>
                        </div>
                    )}

                    {/* Finalized sales for the selected appointment date */}
                    {!isLoading && !loadError && classifiedFinalizedSales.length > 0 && (
                        <details
                            open
                            className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 sm:p-5"
                        >
                            <summary className="cursor-pointer text-xl font-bold text-black">
                                Ventas Finalizadas del Día
                                <span className="ml-2 text-sm font-normal text-neutral-500">
                                    ({classifiedFinalizedSales.length})
                                </span>
                            </summary>

                            <p className="mt-2 text-sm text-neutral-600">
                                Servicios registrados en checkout.
                                Cada venta aparece una sola vez, aunque incluya
                                varias citas o técnicas.
                            </p>

                            <div className="mt-4 space-y-4">
                                {classifiedFinalizedSales.map((sale) => (
                                    <div
                                        key={sale.id}
                                        className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
                                    >
                                        <div className="flex items-center justify-between gap-3 border-b border-neutral-100 p-4">
                                            <p className="font-semibold text-black">
                                                Venta #{sale.id}
                                            </p>

                                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                                Finalizada
                                            </span>
                                        </div>

                                        {sale.assignedItems.length > 0 && (
                                            <div className="p-4">
                                                <h3 className="text-xs font-semibold uppercase text-neutral-500">
                                                    Servicios con cita vinculada
                                                </h3>

                                                <div className="mt-3 space-y-3">
                                                    {sale.assignedItems.map(({ appointmentId, item }) => (
                                                        <div
                                                            key={item.id}
                                                            className="flex items-start justify-between gap-3"
                                                        >
                                                            <div>
                                                                <p className="text-sm font-medium text-black">
                                                                    {item.itemType === "ADDON" ? "+ " : ""}
                                                                    {item.itemName}
                                                                </p>

                                                                <p className="mt-1 text-xs text-neutral-500">
                                                                    Cita #{appointmentId}
                                                                </p>
                                                            </div>

                                                            <span className="shrink-0 text-sm font-semibold text-black">
                                                                ${item.unitPrice.toLocaleString("es-CO")}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {sale.unassignedItems.length > 0 && (
                                            <div className="border-t border-neutral-100 p-4">
                                                <h3 className="text-xs font-semibold uppercase text-amber-700">
                                                    Sin cita individual verificada
                                                </h3>

                                                <div className="mt-3 space-y-3">
                                                    {sale.unassignedItems.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            className="flex items-start justify-between gap-3"
                                                        >
                                                            <div>
                                                                <p className="text-sm font-medium text-black">
                                                                    {item.itemType === "ADDON" ? "+ " : ""}
                                                                    {item.itemName}
                                                                </p>

                                                                <p className="mt-1 text-xs text-neutral-500">
                                                                    {item.employeeId !== null
                                                                        ? "Técnica registrada en checkout"
                                                                        : "Sin atribución individual registrada"}
                                                                </p>
                                                            </div>

                                                            <span className="shrink-0 text-sm font-semibold text-black">
                                                                ${item.unitPrice.toLocaleString("es-CO")}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-4">
                                            <span className="text-sm font-semibold text-neutral-700">
                                                Total de la venta
                                            </span>

                                            <span className="text-lg font-bold text-black">
                                                ${sale.finalTotal.toLocaleString("es-CO")}
                                            </span>
                                        </div>

                                        <p className="px-4 py-3 text-xs text-neutral-500">
                                            Los precios individuales son los registrados
                                            antes de posibles descuentos. El total corresponde
                                            a la venta finalizada.
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}

                    {Object.entries(reservationGroupsByEmployee).map(
                        ([employeeName, reservationGroups]) => (
                            <section key={employeeName}>
                                <h2 className="mb-4 text-xl font-bold text-black">
                                    {employeeName}
                                </h2>

                                <div className="space-y-4">
                                    {reservationGroups.map((group) => (
                                        <div key={group.key} className="space-y-3">
                                            {/* Compact summary for reservations with multiple services. */}
                                                {group.bookingId !== null && group.appointments.length > 1 && (
                                                    <div className="rounded-xl border-l-4 border-violet-400 bg-white p-5 shadow-sm">
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div>
                                                                <Link
                                                                    href={`/staff/customers/${group.customer.id}`}
                                                                    className="text-lg font-bold text-black hover:underline"
                                                                >
                                                                    {group.customer.name}
                                                                </Link>

                                                                <p className="mt-1 text-sm text-neutral-500">
                                                                    Reserva #{group.bookingId} · {group.appointments.length} servicios
                                                                </p>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const key = `${group.appointments[0].employeeId}-${group.key}`;

                                                                    setExpandedBookingGroups((current) =>
                                                                        current.includes(key)
                                                                            ? current.filter((item) => item !== key)
                                                                            : [...current, key]
                                                                    );
                                                                }}
                                                                aria-expanded={expandedBookingGroups.includes(
                                                                    `${group.appointments[0].employeeId}-${group.key}`
                                                                )}
                                                                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-black"
                                                            >
                                                                {expandedBookingGroups.includes(
                                                                    `${group.appointments[0].employeeId}-${group.key}`
                                                                )
                                                                    ? "Ocultar gestión −"
                                                                    : "Gestionar servicios +"}
                                                            </button>
                                                        </div>

                                                        {/* Each service keeps its own time and status. */}
                                                        <div className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
                                                            {group.appointments.map((item) => (
                                                                <div key={item.id} className="flex gap-3 text-sm">
                                                                    <span className="shrink-0 font-semibold text-black">
                                                                        {formatTime(item.startTime)}
                                                                    </span>

                                                                    <div className="min-w-0">
                                                                        <p className="text-black">
                                                                            {item.appointmentServices
                                                                                .map((entry) => entry.service.nameEs)
                                                                                .join(", ")}
                                                                        </p>

                                                                        <p className="text-neutral-500">
                                                                            {item.employee.name} · {getStatusLabel(item.status)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Single appointments stay visible; multi-service controls expand on demand. */}
                                                {(group.appointments.length === 1 ||
                                                    expandedBookingGroups.includes(
                                                        `${group.appointments[0].employeeId}-${group.key}`
                                                    )) && (
                                                    <div className="space-y-3">

                                                {group.appointments.map((appointment) => (
                                                    <div
                                                        key={appointment.id}
                                                        className={`rounded-xl p-5 shadow-sm ${
                                                    appointment.bookingId !== null &&
                                                    getBookingAppointmentCount(
                                                        appointment.bookingId
                                                    ) > 1
                                                        ? "border-l-4 border-violet-400 bg-violet-50/40"
                                                        : "bg-white"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h3 className="text-lg font-semibold text-black">
                                                            <Link
                                                                href={`/staff/customers/${appointment.customer.id}`}
                                                                className="underline-offset-4 hover:underline"
                                                            >
                                                                {appointment.customer.name}
                                                            </Link>
                                                        </h3>

                                                        <p className="text-sm text-neutral-500">
                                                            {appointment.customer.phone}
                                                        </p>
                                                        {appointment.bookingId !== null &&
                                                            getBookingAppointmentCount(
                                                                appointment.bookingId
                                                            ) > 1 && (
                                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
                                                                        Servicio{" "}
                                                                        {getBookingAppointmentPosition(
                                                                            appointment.id,
                                                                            appointment.bookingId
                                                                        )}{" "}
                                                                        de{" "}
                                                                        {getBookingAppointmentCount(
                                                                            appointment.bookingId
                                                                        )}
                                                                    </span>

                                                                    <span className="text-xs font-semibold text-neutral-500">
                                                                        Misma Reserva #{appointment.bookingId}
                                                                    </span>
                                                                </div>
                                                            )}
                                                    </div>

                                                    <span
                                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                                            appointment.status
                                                        )}`}
                                                    >
                                                        {getStatusLabel(appointment.status)}
                                                    </span>
                                                </div>

                                                <div className="mt-4 text-sm text-neutral-700">
                                                    <p>
                                                        <strong>Hora:</strong> {formatTime(appointment.startTime)}
                                                    </p>

                                                    <p>
                                                        <strong>Duración:</strong> {appointment.duration} min
                                                    </p>

                                                    {(
                                                        userRole === "OWNER" ||
                                                        (
                                                            userRole === "RECEPTIONIST" &&
                                                            ["REQUESTED", "BOOKED", "CHECKED_IN"].includes(
                                                                appointment.status
                                                            )
                                                        )
                                                    ) && (
                                                        <div className="mt-4">
                                                            <label
                                                                htmlFor={`time-${appointment.id}`}
                                                                className="block text-sm font-semibold text-black"
                                                            >
                                                                Hora del servicio
                                                            </label>

                                                            <select
                                                                id={`time-${appointment.id}`}
                                                                value={appointment.startTime}
                                                                disabled={
                                                                    reschedulingAppointmentId === appointment.id
                                                                }
                                                                onChange={(event) => {
                                                                    const newStartTime = event.target.value;

                                                                    if (newStartTime !== appointment.startTime) {
                                                                        rescheduleAppointment(
                                                                            appointment.id,
                                                                            appointment.date.slice(0, 10),
                                                                            newStartTime
                                                                        );
                                                                    }
                                                                }}
                                                                className="mt-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-black"
                                                            >
                                                                {Array.from(
                                                                    new Set([
                                                                        ...staffTimeOptions,
                                                                        appointment.startTime,
                                                                    ])
                                                                )
                                                                    .sort((a, b) => a.localeCompare(b))
                                                                    .map((time) => (
                                                                        <option key={time} value={time}>
                                                                            {formatTime(time)}
                                                                        </option>
                                                                    ))}
                                                            </select>

                                                            {reschedulingAppointmentId === appointment.id && (
                                                                <p className="mt-2 text-sm text-neutral-500">
                                                                    Cambiando horario...
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="mt-4">
                                                    <p className="text-sm font-semibold text-black">
                                                        {appointment.status === "COMPLETED"
                                                            ? "Servicios de la reserva original"
                                                            : "Servicios"}
                                                    </p>

                                                    {appointment.appointmentServices.map((item) => (
                                                        <p
                                                            key={item.service.id}
                                                            className="mt-1 text-sm text-neutral-600"
                                                        >
                                                            {item.service.nameEs} - $
                                                            {item.bookedPrice.toLocaleString("es-CO")}
                                                        </p>
                                                    ))}
                                                </div>

                                                {appointment.appointmentAddons.length > 0 && (
                                                    <div className="mt-4">
                                                        <p className="text-sm font-semibold text-black">
                                                            {appointment.status === "COMPLETED"
                                                                ? "Adicionales de la reserva original"
                                                                : "Adicionales"}
                                                        </p>

                                                        {appointment.appointmentAddons.map((item) => (
                                                            <p
                                                                key={item.addon.id}
                                                                className="mt-1 text-sm text-neutral-600"
                                                            >
                                                                {item.addon.nameEs} - $
                                                                {item.bookedPrice.toLocaleString("es-CO")}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Warn when a completed appointment has no linked sale */}
                                                {appointment.status === "COMPLETED" &&
                                                    appointment.saleAppointments.length === 0 && (
                                                        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                                            Servicio completado sin venta vinculada.
                                                            Pago no verificado en el sistema.
                                                        </p>
                                                    )}

                                                {(
                                                    userRole === "OWNER" ||
                                                    (
                                                        userRole === "RECEPTIONIST" &&
                                                        ["REQUESTED", "BOOKED", "CHECKED_IN"].includes(appointment.status)
                                                    )
                                                ) && (
                                                    <div className="mt-5">
                                                        <label
                                                            htmlFor={`employee-${appointment.id}`}
                                                            className="block text-sm font-semibold text-black"
                                                        >
                                                            Técnica
                                                        </label>

                                                        <select
                                                            id={`employee-${appointment.id}`}
                                                            value={appointment.employeeId}
                                                            disabled={reassigningAppointmentId === appointment.id}
                                                            onChange={(event) => {
                                                                const newEmployeeId = Number(event.target.value);

                                                                if (newEmployeeId !== appointment.employeeId) {
                                                                    reassignEmployee(
                                                                        appointment.id,
                                                                        newEmployeeId
                                                                    );
                                                                }
                                                            }}
                                                            className="mt-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm text-black"
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
                                                        {reassigningAppointmentId === appointment.id && (
                                                            <p className="mt-2 text-sm text-neutral-500">
                                                                Cambiando Técnica...
                                                            </p>
                                                        )}
                                                    </div>
                                                )}

                                                {appointment.status === "REQUESTED" && (
                                                    <div className="mt-5">
                                                        <button
                                                            onClick={() =>
                                                                updateAppointmentStatus(
                                                                    appointment.id,
                                                                    "BOOKED"
                                                                )
                                                            }
                                                            className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                                                        >
                                                            Confirmar Cita
                                                        </button>
                                                    </div>
                                                )}

                                                {appointment.status === "BOOKED" && (
                                                    <div className="mt-5 flex gap-3">
                                                        <button
                                                            onClick={() =>
                                                                updateAppointmentStatus(
                                                                    appointment.id,
                                                                    "CHECKED_IN"
                                                                )
                                                            }
                                                            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                                                        >
                                                            Cliente Llegó
                                                        </button>

                                                        {canMarkNoShow(
                                                            appointment.date,
                                                            appointment.startTime
                                                        ) && (
                                                            <button
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

                                                            className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black"
                                                        >
                                                            No Asistió
                                                        </button>
                                                        )}

                                                        <button
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
                                                            className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black"
                                                        >
                                                            Cancelar Cita
                                                        </button>
                                                    </div>
                                                )}

                                                {appointment.status === "CHECKED_IN" && (
                                                    <button
                                                        onClick={() =>
                                                            updateAppointmentStatus(
                                                                appointment.id,
                                                                "IN_PROGRESS"
                                                            )
                                                        }
                                                        className="mt-5 rounded-xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-700"
                                                    >
                                                        Iniciar Servicio
                                                    </button>
                                                )}

                                                {appointment.status === "IN_PROGRESS" && (
                                                    <Link
                                                        href={`/staff/checkout/${appointment.id}`}
                                                        className="mt-5 inline-block rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
                                                    >
                                                        Finalizar Servicio
                                                    </Link>
                                                )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                    )
                )}
                </div>
            </div>
        </main>
    );
}