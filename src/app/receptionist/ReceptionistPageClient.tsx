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

export default function ReceptionistPageClient() {
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

    if (todaysAppointments.length === 0) {
        return (
            <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
                <h2 className="text-xl font-bold text-black">
                    Citas de Hoy
                </h2>

                <p className="mt-2 text-neutral-500">
                    No hay citas programadas para hoy.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-8">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-black">
                    Citas de Hoy
                </h2>

                <span className="text-sm text-neutral-500">
                    {todaysAppointments.length} citas
                </span>
            </div>

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
        </div>
    );
}