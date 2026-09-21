"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
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

    // Count how many appointment blocks belong to the same customer booking
    function getBookingAppointmentCount(bookingId: number | null) {
        if (bookingId === null) {
            return 1;
        }

        return appointmentsForDate.filter(
            (appointment) => appointment.bookingId === bookingId
        ).length;
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

    // Reassign an appointment to another qualified technician
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
                alert(data.error || "No se puedo cambiar la técnica");
                return;
            }

            // Reload appointments so the card moves to the correct technician
            await loadAppointments();
        } catch (error) {
            console.error(error);
            alert("No se pudo cambiar la técnica")
        } finally {
            setReassigningAppointmentId(null);
        }
    }

    // Change the schedule of one appointment block without changing
    // the other services that belong to the same customer booking.
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

                    {Object.entries(appointmentsByEmployee).map(
                        ([employeeName, employeeAppointments]) => (
                            <section key={employeeName}>
                                <h2 className="mb-4 text-xl font-bold text-black">
                                    {employeeName}
                                </h2>

                                <div className="space-y-4">
                                    {employeeAppointments
                                        .sort((a, b) => a.startTime.localeCompare(b.startTime))
                                        .map((appointment) => (
                                        <div
                                            key={appointment.id}
                                            className="rounded-xl bg-white p-5 shadow-sm"
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
                                                        getBookingAppointmentCount(appointment.bookingId) > 1 && (
                                                            <p className="mt-2 text-xs font-semibold text-neutral-500">
                                                                Misma reserva ·{" "}
                                                                {getBookingAppointmentCount(appointment.bookingId)} servicios
                                                            </p>
                                                        )}
                                                </div>

                                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-black">
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
                                                            {staffTimeOptions.map((time) => (
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
                                                    Servicios
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
                                                        Adicionales
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
                                                        className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
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
                                                    className="mt-5 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                                                >
                                                    Iniciar Servicio
                                                </button>
                                            )}

                                            {appointment.status === "IN_PROGRESS" && (
                                                <Link
                                                    href={`/staff/checkout/${appointment.id}`}
                                                    className="mt-5 inline-block rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                                                >
                                                    Finalizar Servicio
                                                </Link>
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