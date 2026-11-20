import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { calculateLifetimeSpend } from "@/lib/customers/calculate-lifetime-spend";
import { groupCustomerVisits } from "@/lib/customers/group-customer-visits";

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
                                    // Finalized services and add-ons recorded at checkout.
                                    lineItems: {
                                        select: {
                                            id: true,
                                            itemType: true,
                                            itemId: true,
                                            itemName: true,
                                            unitPrice: true,
                                            employeeId: true,
                                            appointmentId: true,
                                            parentLineItemId: true,
                                            // Technician recorded on the finalized sale line item.
                                            // Null for legacy sales without individual attribution.
                                            employee: {
                                                select: {
                                                    id: true,
                                                    name: true,
                                                },
                                            },
                                        },
                                        orderBy: {
                                            id: "asc",
                                        },
                                    },
                                    // Identify every customer associated with this sale.
                                    // This prevents incorrectly attributing a shared sale
                                    // to multiple customers.
                                    saleAppointments: {
                                        select: {
                                            appointment: {
                                                select: {
                                                    customerId: true,
                                                },
                                            },
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

    // Count completed salon visits rather than individual service blocks.
    // Multiple completed appointments linked to one sale count as one visit.
    const completedVisitCount = groupCustomerVisits(
        completedAppointments
    ).length;

    // Count each finalized sale once and flag ambiguous ownership.
    const {
        lifetimeSpend,
        ambiguousSaleIds,
    } = calculateLifetimeSpend(
        customerId,
        completedAppointments
    );

    const lastVisit =
        completedAppointments.length > 0
            ? completedAppointments[0].date
            : null;

    // Group related appointments into customer visits.
    // Keep the original appointments for individual service details.
    const visitGroups = groupCustomerVisits(
        customer.appointments
    );

    return (
        <main className="min-h-screen w-full bg-neutral-100 px-4 py-8 text-neutral-900 sm:px-6 sm:py-10">
            <div className="mx-auto max-w-5xl">

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
                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                        <p className="text-sm text-gray-500">
                            Visitas completadas
                        </p>

                        <p className="mt-1 text-2xl font-semibold">
                            {completedVisitCount}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                        <p className="text-sm text-gray-500">
                            No asistió
                        </p>

                        <p className="mt-1 text-2xl font-semibold">
                            {noShows.length}
                        </p>
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                        <p className="text-sm text-gray-500">
                            {ambiguousSaleIds.length > 0
                                ? "Gasto verificado"
                                : "Gasto total"}
                        </p>

                        <p className="mt-1 text-2xl font-semibold">
                            ${lifetimeSpend.toLocaleString("es-CO")}
                        </p>

                        {ambiguousSaleIds.length> 0 && (
                            <div
                                role="status"
                                className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                            >
                                <p className="font-semibold">
                                    Transacciones pendientes de revisión
                                </p>

                                <p className="mt-1">
                                    {ambiguousSaleIds.length}{" "}
                                    {ambiguousSaleIds.length === 1
                                        ? "venta no pudo atribuirse"
                                        : "ventas no pudieron atribuirse"}{" "}
                                    exclusivamente a este cliente.
                                    El gasto mostrado excluye esas transacciones.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
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

                {visitGroups.length === 0 ? (
                    <p className="text-sm text-gray-500">
                        Este cliente todavía no tiene citas.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {visitGroups.map((group) => {
                            const firstAppointment = group.appointments[0];

                            // Retrieve the sale once for the entire visit.
                            const linkedSale =
                                group.saleId !== null
                                    ? group.appointments
                                        .flatMap((appointment) =>
                                            appointment.saleAppointments
                                        )
                                        .find(
                                            (link) => link.sale.id === group.saleId
                                        )?.sale
                                    : null;

                            return (
                                <div
                                    key={group.key}
                                    className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"
                                >
                                    {/* Visit heading */}
                                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 p-4 sm:p-5">
                                        <div>
                                            <p className="font-semibold text-black">
                                                {new Intl.DateTimeFormat("es-CO", {
                                                    timeZone: "America/Bogota",
                                                    day: "numeric",
                                                    month: "long",
                                                    year: "numeric",
                                                }).format(firstAppointment.date)}
                                            </p>

                                            <p className="mt-1 text-xs text-neutral-500">
                                                {linkedSale
                                                    ? `Venta #${linkedSale.id}`
                                                    : group.bookingId !== null
                                                        ? `Reserva #${group.bookingId}`
                                                        : `Cita #${firstAppointment.id}`}
                                                {" · "}
                                                {linkedSale ? (
                                                    <>
                                                        {linkedSale.lineItems.filter(
                                                            (item) => item.itemType === "SERVICE"
                                                        ).length}{" "}
                                                        {linkedSale.lineItems.filter(
                                                            (item) => item.itemType === "SERVICE"
                                                        ).length === 1
                                                            ? "servicio"
                                                            : "servicios"}

                                                        {linkedSale.lineItems.some(
                                                            (item) => item.itemType === "ADDON"
                                                        ) && (
                                                            <>
                                                                {" · "}
                                                                {linkedSale.lineItems.filter(
                                                                    (item) => item.itemType === "ADDON"
                                                                ).length}{" "}
                                                                {linkedSale.lineItems.filter(
                                                                    (item) => item.itemType === "ADDON"
                                                                ).length === 1
                                                                    ? "complemento"
                                                                    : "complementos"}
                                                            </>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {group.appointments.length}{" "}
                                                        {group.appointments.length === 1
                                                            ? "cita"
                                                            : "citas"}
                                                    </>
                                                )}
                                            </p>
                                        </div>

                                        {linkedSale && (
                                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                                Venta registrada
                                            </span>
                                        )}
                                    </div>

                                    {/* Finalized items actually charged at checkout */}
                                    {linkedSale && (
                                        <div className="border-b border-neutral-100 px-4 py-4 sm:px-5">
                                            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#B76E79]">
                                                Servicios cobrados
                                            </p>

                                            {linkedSale.lineItems.length > 0 ? (
                                                <div className="space-y-3">
                                                    {linkedSale.lineItems.map((item) => (
                                                        <div
                                                            key={item.id}
                                                            className="flex items-start justify-between gap-4"
                                                        >
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-black">
                                                                    {item.itemType === "ADDON" ? "+ " : ""}
                                                                    {item.itemName}
                                                                </p>

                                                                <p className="mt-0.5 text-xs text-neutral-500">
                                                                    {item.itemType === "ADDON"
                                                                        ? "Complemento"
                                                                        : "Servicio"}

                                                                    {item.employee && (
                                                                        <span className="block mt-1 text-neutral-600">
                                                                            Técnica registrada: {item.employee.name}
                                                                        </span>
                                                                    )}
                                                                </p>
                                                            </div>

                                                            <span className="shrink-0 text-sm font-semibold text-black">
                                                                ${item.unitPrice.toLocaleString("es-CO")}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-neutral-500">
                                                    No hay detalles de servicios registrados para esta venta.
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* Preserve original booking details without confusing
                                        them with finalized checkout services. */}
                                    <details
                                        className="border-t border-neutral-100 px-4 py-3 sm:px-5"
                                        open={!linkedSale}
                                    >
                                        <summary className="cursor-pointer text-sm font-medium text-neutral-500 hover:text-black">
                                            {linkedSale
                                                ? "Ver reserva original"
                                                : "Detalles de la cita"}
                                        </summary>

                                        <div className="divide-y divide-neutral-100">
                                            {group.appointments.map((appointment) => (
                                                <div
                                                    key={appointment.id}
                                                    className="py-4"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <p className="text-sm font-medium text-neutral-700">
                                                            {appointment.startTime}
                                                            {" · "}
                                                            {appointment.employee.name}
                                                        </p>

                                                        <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600">
                                                            {getStatusLabel(appointment.status)}
                                                        </span>
                                                    </div>

                                                    <div className="mt-3 space-y-1">
                                                        {appointment.appointmentServices.map(
                                                            (item) => (
                                                                <p
                                                                    key={item.serviceId}
                                                                    className="text-sm font-semibold text-black"
                                                                >
                                                                    {item.service.nameEs}
                                                                </p>
                                                            )
                                                        )}

                                                        {appointment.appointmentAddons.map(
                                                            (item) => (
                                                                <p
                                                                    key={item.id}
                                                                    className="text-sm text-neutral-600"
                                                                >
                                                                    + {item.addon.nameEs}
                                                                </p>
                                                            )
                                                        )}
                                                    </div>

                                                    <p className="mt-2 text-xs text-neutral-500">
                                                        Duración de la cita: {appointment.duration} min
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </details>

                                    {/* Display the finalized sale amount only once. */}
                                    {linkedSale ? (
                                        <div className="flex items-center justify-between gap-3 border-t border-neutral-200 bg-neutral-50 px-4 py-4 sm:px-5">
                                            <span className="text-sm font-semibold text-neutral-700">
                                                Total de la venta
                                            </span>

                                            <span className="text-lg font-bold text-black">
                                                ${linkedSale.finalTotal.toLocaleString("es-CO")}
                                            </span>
                                        </div>
                                    ) : group.appointments.some(
                                        (appointment) =>
                                            appointment.status === "COMPLETED"
                                    ) ? (
                                        <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800 sm:px-5">
                                            Servicio completado sin venta vinculada.
                                            Pago no verificado en el sistema.
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
                </section>
            </div>
        </main>
    );
}