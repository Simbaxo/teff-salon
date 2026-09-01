"use client";

import { useState } from "react";

type CheckoutService = {
    bookedPrice: number;
    service: {
        id: number;
        nameEs: string;
    };
};

type CheckoutAddon = {
    bookedPrice: number;
    addon: {
        id: number;
        nameEs: string;
    };
};

type CheckoutEditorProps = {
    services: CheckoutService[];
    addons: CheckoutAddon[];
}

export default function CheckoutEditor({
    services,
    addons,
}: CheckoutEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    // Keep track of the services that will actually be charged
    const [selectedServices, setSelectedServices] = useState(services);
    // Keep track of the add-ons that will actually be charged
    const [selectedAddons, setSelectedAddons] = useState(addons);
    
    // Calculate the value of the services still selected for checkout
    const servicesTotal = selectedServices.reduce(
        (total, item) => total + item.bookedPrice,
        0
    );

    // Calculate the value of the add-ons still selected for checkout
    const addonsTotal = selectedAddons.reduce(
        (total, item) => total + item.bookedPrice,
        0
    );

    // This is the current amount we expect to charge the customer
    const checkoutSubtotal = servicesTotal + addonsTotal;

    return (
        <div className="mt-6 rounded-xl border border-neutral-200 p-4">
            <p className="font-semibold text-black">
                Verificar Servicios
            </p>

            <p className="mt-1 text-sm text-neutral-500">
                Confirma que los servicios y adicionales realizados
                coincidan con lo que se cobrara al cliente.
            </p>

            <button
                type="button"
                onClick={() => setIsEditing((current) => !current)}
                className="mt-4 rounded-xl border border-neutral-300 px-4 py-2 text-sm font-semibold text-black"
            >
                {isEditing ? "Cerrar Edición" : "Editar Servicios"}
            </button>

            {isEditing && (
                <div className="mt-4 rounded-xl bg-neutral-100 p-4">
                    {/* Show the services currently attached to the appointment */}
                    <div>
                        <p className="text-sm font-semibold text-black">
                            Servicios Actuales
                        </p>

                        <div className="mt-3 space-y-2">
                            {selectedServices.map((item) => (
                                <div
                                    key={item.service.id}
                                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                                >
                                    <span className="text-sm text-neutral-700">
                                        {item.service.nameEs}
                                    </span>

                                    <div className="flex items-center gap-3">
                                    <span className="text-sm font-semibold text-black">
                                        ${item.bookedPrice.toLocaleString("es-CO")}
                                    </span>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSelectedServices((current) =>
                                                current.filter(
                                                    (serviceItem) =>
                                                        serviceItem.service.id !== item.service.id
                                                )
                                            )
                                        }
                                        className="text-xs font-semibold text-red-600"
                                    >
                                        Quitar
                                    </button>
                                </div>

                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Show the add-ons currently attached to the appointment */}
                    <div className="mt-5">
                        <p className="text-sm font-semibold text-black">
                            Adicionales Actuales
                        </p>

                        {selectedAddons.length > 0 ? (
                            <div className="mt-3 space-y-2">
                                {selectedAddons.map((item) => (
                                    <div
                                        key={item.addon.id}
                                        className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                                    >
                                        <span className="text-sm text-neutral-700">
                                            {item.addon.nameEs}
                                        </span>

                                        <div className="flex items-center gap-3">
                                            <span className="text-sm font-semibold text-black">
                                                ${item.bookedPrice.toLocaleString("es-CO")}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSelectedAddons((current) =>
                                                        current.filter(
                                                            (addonItem) =>
                                                                addonItem.addon.id !== item.addon.id
                                                        )
                                                    )
                                                }
                                                className="text-xs font-semibold text-red-600"
                                            >
                                                Quitar
                                            </button>

                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2 text-sm text-neutral-500">
                                No hay adicionales en esta cita.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* This subtotal updates when checkout items change */}
            <div className="mt-5 border-t border-neutral-200 pt-4">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-black">
                        Subtotal Actualizado
                    </span>

                    <span className="text-lg font-bold text-black">
                        ${checkoutSubtotal.toLocaleString("es-CO")}
                    </span>
                </div>
            </div>
        </div>
    );
}