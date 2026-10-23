import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canCheckout } from "@/lib/auth-roles";
import { isAttributedCheckoutEnabled } from "@/lib/checkout/is-attributed-checkout-enabled";
import {
    authorizeAttributedCheckoutTest,
    authorizeAttributedFixtureAppointments,
} from "@/lib/checkout/authorize-attributed-test";
import CheckoutEditor from "./CheckoutEditor";

// Display appointment times in AM/PM format.
function formatTime(time: string) {
    const [hours, minutes] = time.split(":").map(Number);

    const period = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;

    return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}

export default async function CheckoutPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const session = await auth();

    // Checkout is only available to authenticated TEFF staff
    if (!session?.user) {
        redirect("/login");
    }

    // Only OWNER and RECEPTIONIST can access checkout
    if (!canCheckout(session.user.role)) {
        redirect("/staff");
    }
    
    const { id } = await params;

    // Load the appointment directly from the database.
    // This avoids calling our own API from the server component.
    const appointment = await prisma.appointment.findUnique({
        where: {
            id: Number(id),
        },
        include: {
            customer: true,
            employee: true,
            appointmentServices: {
                include: {
                    service: true,
                },
            },
            appointmentAddons: {
                include: {
                    addon: true,
                },
            },

            // When this appointment belongs to a multi-service booking,
            // load every appointment block from the same customer visit.
            booking: {
                include: {
                    appointments: {
                        include: {
                            employee: true,
                            appointmentServices: {
                                include: {
                                    service: true,
                                },
                            },
                            appointmentAddons: {
                                include: {
                                    addon: true,
                                },
                            },
                        },
                        orderBy: {
                            startTime: "asc",
                        },
                    },
                },
            },
        },
    });

    // Show an error if the appointment does not exist
    if (!appointment) {
        return (
            <main className="min-h-screen bg-neutral-100 p-6">
                <div className="mx-auto max-w-3xl">
                    <h1 className="text-3xl font-bold text-black">
                        No se pudo cargar la cita
                    </h1>
                </div>
            </main>
        )
    }

    // New bookings may contain multiple technician appointment blocks.
    // Legacy appointments without a Booking continue to checkout normally.
    const visitAppointments =
        appointment.booking?.appointments ?? [appointment];

    // Production uses role-based authorization and a server-side flag.
    // Development remains restricted to the isolated test fixture.
    const attributedCheckoutEnabled =
        isAttributedCheckoutEnabled(session.user.role) ||
        (
            authorizeAttributedCheckoutTest(session.user) &&
            authorizeAttributedFixtureAppointments(
                visitAppointments.map((item) => item.id),
                visitAppointments
            )
        );

    // Load active technicians and their qualified services.
    // Only needed for the isolated attributed-checkout interface.
    const qualifiedTechnicians = attributedCheckoutEnabled
        ? await prisma.employee.findMany({
            where: {
                active: true,
                isBookable: true,
            },
            select: {
                id: true,
                name: true,
                employeeServices: {
                    select: {
                        serviceId: true,
                    },
                },
            },
            orderBy: {
                name: "asc",
            },
        })
        : [];

    const visitAlreadyCompleted = visitAppointments.some(
        (visitAppointment) =>
            visitAppointment.status ==="COMPLETED"
    );
    // Prevent staff from opening an editable checkout for a finished appointment
    if (visitAlreadyCompleted) {
        return (
            <main className="mx-auto max-w-2xl p-6">
                <div className="rounded-xl border border-neutral-200 p-6 text-center">
                    <h1 className="text-2xl font-bold">
                        Venta ya registrada ✔︎
                    </h1>

                    <p className="mt-2 text-neutral-500">
                        Esta cita ya fue finalizada y no puede volver a cobrarse.
                    </p>
                    {/* Allow staff to navigate away without reopening checkout. */}
                    <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                        <a
                            href="/staff"
                            className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white"
                        >
                            ← Volver a Citas
                        </a>

                        <a
                            href="/receptionist"
                            className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-semibold"
                        >
                            Ir a Recepción
                        </a>
                    </div>
                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-3xl">
                        <h1 className="text-3xl font-bold text-black">
                            Finalizar Servicio
                        </h1>

                        {/* Return to appointments without submitting checkout. */}
                        <a
                            href="/staff"
                            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 hover:text-black"
                        >
                            ← Volver a las citas
                        </a>

                        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-bold text-black">
                        {appointment.customer.name}
                    </h2>

                    <p className="mt-1 text-neutral-600">
                        {appointment.customer.phone}
                    </p>

                    <div className="mt-6">
                        <p className="font-semibold text-black">
                            Servicios realizados
                        </p>

                        <div className="mt-4 space-y-4">
                            {visitAppointments.map((visitAppointment) => (
                                <div
                                    key={visitAppointment.id}
                                    className="rounded-xl border border-neutral-200 p-4"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-semibold text-black">
                                                {visitAppointment.employee.name}
                                            </p>

                                            <p className="mt-1 text-sm text-neutral-500">
                                                {formatTime(visitAppointment.startTime)}
                                            </p>
                                        </div>

                                        <span className="text-sm text-neutral-500">
                                            {visitAppointment.duration} min
                                        </span>
                                    </div>

                                    <div className="mt-4">
                                        {visitAppointment.appointmentServices.map(
                                            (item) => (
                                                <p
                                                    key={`${visitAppointment.id}-${item.service.id}`}
                                                    className="mt-1 text-sm text-neutral-700"
                                                >
                                                    {item.service.nameEs} — $
                                                    {item.bookedPrice.toLocaleString(
                                                        "es-CO"
                                                    )}
                                                </p>
                                            )
                                        )}
                                    </div>

                                    {visitAppointment.appointmentAddons.length > 0 && (
                                        <div className="mt-3 border-t border-neutral-200 pt-3">
                                            <p className="text-sm font-semibold text-black">
                                                Adicionales
                                            </p>

                                            {visitAppointment.appointmentAddons.map(
                                                (item) => (
                                                    <p
                                                        key={`${visitAppointment.id}-${item.addon.id}`}
                                                        className="mt-1 text-sm text-neutral-600"
                                                    >
                                                        {item.addon.nameEs} — $
                                                        {item.bookedPrice.toLocaleString(
                                                            "es-CO"
                                                        )}
                                                    </p>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <CheckoutEditor
                        appointmentId={appointment.id}
                        visitAppointments={visitAppointments}
                        attributedCheckoutEnabled={attributedCheckoutEnabled}
                        qualifiedTechnicians={qualifiedTechnicians}
                    />
                </div>
            </div>
        </main>
    );
}