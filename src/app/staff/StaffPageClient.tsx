"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOut } from "next-auth/react";

type Appointment = {
    id: number;
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

export default  function StaffPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().slice(0, 10)
    );

    // Load The Appointments
    useEffect(() => {
        async function loadAppointments() {
            const response = await fetch("/api/appointments");
            const data = await response.json();

            setAppointments(data);
        }

        loadAppointments();
    }, []);

    // Create the Filtered Appointments
    const appointmentsForDate = appointments.filter(
        (appointment) =>
            appointment.date.slice(0, 10) === selectedDate
    );

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
                                                        {appointment.customer.name}
                                                    </h3>

                                                    <p className="text-sm text-neutral-500">
                                                        {appointment.customer.phone}
                                                    </p>
                                                </div>

                                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-black">
                                                    {getStatusLabel(appointment.status)}
                                                </span>
                                            </div>

                                            <div className="mt-4 text-sm text-neutral-700">
                                                <p>
                                                    <strong>Hora:</strong> {appointment.startTime}
                                                </p>

                                                <p>
                                                    <strong>Duración:</strong> {appointment.duration} min
                                                </p>
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

                                            {appointment.status === "BOOKED" && (
                                                <button
                                                    onClick={() =>
                                                        updateAppointmentStatus(
                                                            appointment.id,
                                                            "CHECKED_IN"
                                                        )
                                                    }
                                                    className="mt-5 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                                                >
                                                    Cliente Llegó
                                                </button>
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