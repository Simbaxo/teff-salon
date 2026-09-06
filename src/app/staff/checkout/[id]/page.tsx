import CheckoutEditor from "./CheckoutEditor";

type CheckoutAppointment = {
    id: number;
    status: string;
    startTime: string;
    duration: number;

    customer: {
        name: string;
        phone: string;
    };

    employee: {
        name: string;
    };

    appointmentServices: {
        bookedPrice: number;
        service: {
            nameEs: string;
        };
    }[];

    appointmentAddons: {
        bookedPrice: number;
        addon: {
            nameEs: string;
        };
    }[];
};

export default async function CheckoutPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const response = await fetch(
        `http://localhost:3000/api/appointments/${id}`,
        {
            cache: "no-store",
        }
    );

    if (!response.ok) {
        return (
            <main className="min-h-screen bg-neutral-100 p-6">
                <div className="mx-auto max-w-3xl">
                    <h1 className="text-3xl font-bold text-black"> 
                        No se pudo cargar la cita
                    </h1>
                </div>
            </main>
        );
    }

    const appointment: CheckoutAppointment =
        await response.json();

    const servicesTotal =
        appointment.appointmentServices.reduce(
            (total, item) => total + item.bookedPrice,
            0
        );

    const addonsTotal =
        appointment.appointmentAddons.reduce(
            (total, item) => total + item.bookedPrice,
            0
        )

    const subtotal = servicesTotal + addonsTotal;

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