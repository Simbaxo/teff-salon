import { prisma } from "@/lib/prisma";

import CheckoutEditor from "./CheckoutEditor";

export default async function CheckoutPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
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

    // Prevent staff from opening an editable checkout for a finished appointment
    if (appointment.status === "COMPLETED") {
        return (
            <main className="mx-auto max-w-2xl p-6">
                <div className="rounded-xl border border-neutral-200 p-6 text-center">
                    <h1 className="text-2xl font-bold">
                        Venta ya registrada ✔︎
                    </h1>

                    <p className="mt-2 text-neutral-500">
                        Esta cita ya fue finalizada y no puede volver a cobrarse.
                    </p>

                    <a 
                        href="/staff"
                        className="mt-6 inline-block rounded-lg bg-black px-4 py-2 text-white"
                    >
                        Volver a las citas
                    </a>
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

                <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
                    <h2 className="text-xl font-bold text-black">
                        {appointment.customer.name}
                    </h2>

                    <p className="mt-1 text-neutral-600">
                        {appointment.customer.phone}
                    </p>

                    <div className="mt-4 text-sm text-neutral-700">
                        <p>
                            <strong>Manicurista:</strong>{" "}
                            {appointment.employee.name}
                        </p>

                        <p>
                            <strong>Hora:</strong>{" "}
                            {appointment.startTime}
                        </p>

                        <p>
                            <strong>Duración Estimada:</strong>{" "}
                            {appointment.duration} min
                        </p>
                    </div>

                    <div className="mt-6">
                        <p className="font-semibold text-black">
                            Servicios
                        </p>

                        {appointment.appointmentServices.map(
                            (item) => (
                                <p
                                    key={item.service.nameEs}
                                    className="mt-2 text-neutral-600"
                                >
                                    {item.service.nameEs} - $
                                    {item.bookedPrice.toLocaleString(
                                        "es-CO"
                                    )}
                                </p>
                            )
                        )}
                    </div>

                    {appointment.appointmentAddons.length > 0 && (
                        <div className="mt-6">
                            <p className="font-semibold text-black">
                                Adicionales
                            </p>

                            {appointment.appointmentAddons.map(
                                (item) => (
                                    <p
                                        key={item.addon.nameEs}
                                        className="mt-2 text-neutral-600"
                                    >
                                        {item.addon.nameEs} - $
                                        {item.bookedPrice.toLocaleString(
                                            "es-CO"
                                        )}
                                    </p>
                                )
                            )}
                        </div>
                    )}
                    
                    <CheckoutEditor
                        appointmentId={appointment.id} 
                        services={appointment.appointmentServices}
                        addons={appointment.appointmentAddons}
                    />
                </div>
            </div>
        </main>
    );
}