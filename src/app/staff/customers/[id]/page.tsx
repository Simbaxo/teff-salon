import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";

// Convert database statuses into Spanish labels for staff
function getStatusLabel(status: string) {
    const labels: Record<string, string> = {
        BOOKED: "Reservada",
        REQUESTED: "Solicitada",
        CHECKED_IN: "Registrada",
        IN_PROGRESS: "En servicio",
        COMPLETED: "Completada",
        CANCELLED: "Cancelada",
        NO_SHOW: "No asistió",
    }

    return labels[status] ?? status;
}

export default async function CustomerProfilePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!canManageStaff(session.user.role)) {
        redirect("/staff");
    }

    const { id } = await params;

    // Convert and validate the customer ID from the URL
    const customerId = Number(id);

    if (!Number.isInteger(customerId) || customerId <= 0) {
        redirect("/staff");
    }

    // Load the customer and their appointments history directly from the database
    const customer = await prisma.customer.findUnique({
        where: {
            id: customerId,
        },

        include: {
            appointments: {
                orderBy: {
                    date: "desc",
                },

                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },

                    appointmentServices: {
                        include: {
                            service: {
                                select: {
                                    id: true,
                                    nameEs: true,
                                    nameEn: true,
                                },
                            },
                        },
                    },

                    appointmentAddons: {
                        include: {
                            addon: {
                                select: {
                                    id: true,
                                    nameEs: true,
                                    nameEn: true,
                                },
                            },
                        },
                    },

                    saleAppointments: {
                        include: {
                            sale: {
                                select: {
                                    id: true,
                                    finalTotal: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!customer) {
        redirect("/staff");
    }

    // Calculate customer summary metrics from appointment and sale history
    const completedAppointments = customer.appointments.filter(
        (appointment) => appointment.status === "COMPLETED"
    );

    const noShows = customer.appointments.filter(
        (appointment) => appointment.status === "NO_SHOW"
    );

    const lifetimeSpend = completedAppointments.reduce(
        (total, appointment) => {
            const appointmentSpend = appointment.saleAppointments.reduce(
                (saleTotal, saleAppointment) =>
                    saleTotal + saleAppointment.sale.finalTotal,
                0
            );

            return total + appointmentSpend;
        },
        0
    );

    const lastVisit =
        completedAppointments.length > 0
            ? completedAppointments[0].date
            : null;

    return (
        <main className="mx-auto max-w-5xl p-6">

            {/* Return to the staff appointment list */}
            <Link
                href="/staff"
                className="mb-6 inline-block text-sm font-medium text-neutral-600 hover:text-black"
            >
                ← Volver a Citas
            </Link>

            {/* Customer Identity */}
            <div className="mb-8">
                <p className="text-sm text-gray-500">Cliente</p>

                <h1 className="text-3xl font-semibold">
                    {customer.name}
                </h1>

                <div className="mt-2 space-y-1 text-sm text-gray-600">
                    <p>{customer.phone}</p>

                    {customer.email && <p>{customer.email}</p>}
                </div>
            </div>

            {/* Customer History Summary */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border p-4">
                    <p className="text-sm text-gray-500">
                        Visitas completadas
                    </p>

                    <p className="mt-1 text-2xl font-semibold">
                        {completedAppointments.length}
                    </p>
                </div>

                <div className="rounded-xl border p-4">
                    <p className="text-sm text-gray-500">
                        No asistió
                    </p>

                    <p className="mt-1 text-2xl font-semibold">
                        {noShows.length}
                    </p>
                </div>

                <div className="rounded-xl border p-4">
                    <p className="text-sm text-gray=500">
                        Gasto total
                    </p>

                    <p className="mt-1 text-2xl font-semibold">
                        ${lifetimeSpend.toLocaleString("es-CO")}
                    </p>
                </div>

                <div className="rounded-xl border p-4">
                    <p className="text-sm text-gray-500">
                        Ultima visita
                    </p>

                    <p className="mt-1 text-lg font-semibold">
                        {lastVisit
                            ? new Intl.DateTimeFormat("es-CO", {
                                timeZone: "America/Bogota",
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                            }).format(lastVisit)
                            : "Sin visitas"}
                    </p>
                </div>
            </div>

            {/* Appointment History */}
            <section className="mt-10">
                <h2 className="mb-4 text-xl font-semibold">
                    Historial de Visitas
                </h2>

                {customer.appointments.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        Este cliente todavía no tiene citas.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {customer.appointments.map((appointment) => (
                            <div
                                key={appointment.id}
                                className="rounded-xl border p-4"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold">
                                            {new Intl.DateTimeFormat("es-CO", {
                                                timeZone: "America/Bogota",
                                                day: "numeric",
                                                month: "long",
                                                year: "numeric",
                                            }).format(appointment.date)}
                                        </p>

                                        <p className="text-sm text-gray-500">
                                            {appointment.startTime} · {appointment.employee.name}
                                        </p>
                                    </div>

                                    <span className="rounded-full border px-3 py-1 text-xs">
                                        {getStatusLabel(appointment.status)}
                                    </span>
                                </div>

                                <div className="mt-4">
                                    <p className="text-sm font-medium">Servicios</p>

                                    <div className="mt-1 space-y-1 text-sm text-gray-600">
                                        {appointment.appointmentServices.map(
                                            (appointmentService) => (
                                                <p key={appointmentService.serviceId}>
                                                    {appointmentService.service.nameEs}
                                                </p>
                                            )
                                        )}

                                        {appointment.appointmentAddons.map(
                                            (appointmentAddon) => (
                                                <p key={appointmentAddon.addonId}>
                                                    + {appointmentAddon.addon.nameEs}
                                                </p>
                                            )
                                        )}
                                    </div>
                                </div>

                                <p className="mt-4 text-sm text-gray-500">
                                    Duración: {appointment.duration} min
                                </p>

                                {/* Show actual checkout total when this appointment has a completed sale */}
                                {appointment.saleAppointments.length > 0 && (
                                    <p className="mt-2 text-sm font-medium">
                                        Total Pagado: $
                                        {appointment.saleAppointments
                                            .reduce(
                                                (total, saleAppointment) =>
                                                    total + saleAppointment.sale.finalTotal,
                                                0
                                            )
                                            .toLocaleString("es-CO")}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}