"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    getTeffCurrentMinutes,
    getTeffToday,
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

function timeToMinutes(time: string) {
    const [hours, minutes] = time
        .slice(0, 5)
        .split(":")
        .map(Number);

    return hours * 60 + minutes;
}

function formatTime(time: string) {
    const [hours, minutes] = time
        .slice(0, 5)
        .split(":")
        .map(Number);

    const suffix = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;

    return `${displayHour}:${minutes
        .toString()
        .padStart(2, "0")} ${suffix}`;
}

function formatDate(date: string) {
    return new Intl.DateTimeFormat("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(
        new Date(`${date.slice(0, 10)}T12:00:00.000Z`)
    );
}

export default function UpcomingAppointmentsClient() {
    const [appointments, setAppointments] =
        useState<Appointment[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        async function loadAppointments() {
            try {
                setIsLoading(true);
                setLoadError("");

                const response = await fetch(
                    "/api/appointments"
                );

                if (!response.ok) {
                    throw new Error(
                        "No se pudieron cargar las citas"
                    );
                }

                const data: Appointment[] =
                    await response.json();

                setAppointments(data);
            } catch (error) {
                console.error(error);

                setLoadError(
                    "No se pudieron cargar las próximas citas."
                );
            } finally {
                setIsLoading(false);
            }
        }

        loadAppointments();
    }, []);

    const today = getTeffToday();
    const currentMinutes = getTeffCurrentMinutes();

    const upcomingAppointments = appointments
        .filter((appointment) => {
            const appointmentDate =
                appointment.date.slice(0, 10);

            if (appointmentDate > today) {
                return true;
            }

            if (appointmentDate < today) {
                return false;
            }

            return (
                timeToMinutes(appointment.startTime) >
                currentMinutes
            );
        })
        .sort((a, b) => {
            const dateComparison =
                a.date.localeCompare(b.date);

            if (dateComparison !== 0) {
                return dateComparison;
            }

            return a.startTime.localeCompare(
                b.startTime
            );
        });

    const appointmentsByDate = upcomingAppointments.reduce(
        (groups, appointment) => {
            const date = appointment.date.slice(0, 10);

            if (!groups[date]) {
                groups[date] = [];
            }

            groups[date].push(appointment);

            return groups;
        },
        {} as Record<string, Appointment[]>
    );

    function getBookingAppointmentCount(
        bookingId: number | null
    ) {
        if (bookingId === null) {
            return 1;
        }

        return upcomingAppointments.filter(
            (appointment) =>
                appointment.bookingId === bookingId
        ).length;
    }

    function getBookingAppointmentPosition(
        appointmentId: number,
        bookingId: number | null
    ) {
        if (bookingId === null) {
            return null;
        }

        const bookingAppointments = upcomingAppointments
            .filter(
                (appointment) =>
                    appointment.bookingId === bookingId
            )
            .sort((a, b) => {
                const dateComparison =
                    a.date.localeCompare(b.date);

                if (dateComparison !== 0) {
                    return dateComparison;
                }

                return a.startTime.localeCompare(
                    b.startTime
                );
            });

        const index = bookingAppointments.findIndex(
            (appointment) =>
                appointment.id === appointmentId
        );

        return index >= 0 ? index + 1 : null;
    }

    if (isLoading) {
        return (
            <p className="mt-8 text-neutral-500">
                Cargando próximas citas...
            </p>
        );
    }

    if (loadError) {
        return (
            <p className="mt-8 text-red-700">
                {loadError}
            </p>
        );
    }

    return (
        <div className="mt-8">
            <p className="text-sm text-neutral-500">
                {upcomingAppointments.length}{" "}
                {upcomingAppointments.length === 1
                    ? "servicio programado"
                    : "servicios programados"}
            </p>

            {upcomingAppointments.length === 0 ? (
                <div className="mt-4 rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-neutral-500">
                        No hay próximas citas programadas.
                    </p>
                </div>
            ) : (
                <div className="mt-6 space-y-8">
                    {Object.entries(appointmentsByDate).map(
                        ([date, dateAppointments]) => (
                            <section key={date}>
                                {/* Show the date once for the entire day's agenda */}
                                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                                    <h2 className="text-xl font-bold capitalize text-black">
                                        {formatDate(date)}
                                    </h2>

                                    <p className="text-sm text-neutral-500">
                                        {dateAppointments.length}{" "}
                                        {dateAppointments.length === 1
                                            ? "servicio programado"
                                            : "servicios programados"}
                                    </p>
                                </div>

                                <div className="space-y-3">
                                    {dateAppointments.map(
                                        (appointment) => (
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
                                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                    <div>
                                                        <p className="text-lg font-bold text-black">
                                                            {formatTime(
                                                                appointment.startTime
                                                            )}
                                                        </p>

                                                        <Link
                                                            href={`/staff/customers/${appointment.customer.id}`}
                                                            className="mt-2 inline-block font-bold text-black hover:underline"
                                                        >
                                                            {appointment.customer.name}
                                                        </Link>

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
                                                                        Misma reserva #{appointment.bookingId}
                                                                    </span>
                                                                </div>
                                                            )}
                                                    </div>

                                                    <div className="sm:text-right">
                                                        <p className="font-semibold text-black">
                                                            {appointment.employee.name}
                                                        </p>

                                                        <p className="mt-1 text-sm text-neutral-500">
                                                            {appointment.status ===
                                                            "REQUESTED"
                                                                ? "Pendiente"
                                                                : "Reservada"}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="mt-4 border-t border-neutral-200 pt-4">
                                                    {appointment.appointmentServices.map(
                                                        (item) => (
                                                            <p
                                                                key={item.service.id}
                                                                className="text-sm text-neutral-700"
                                                            >
                                                                {item.service.nameEs}
                                                            </p>
                                                        )
                                                    )}

                                                    {appointment.appointmentAddons.map(
                                                        (item) => (
                                                            <p
                                                                key={item.addon.id}
                                                                className="mt-1 text-sm text-neutral-500"
                                                            >
                                                                + {item.addon.nameEs}
                                                            </p>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            </section>
                        )
                    )}
                </div>
            )}
        </div>
    );
}