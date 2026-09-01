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
                <div className="mt-4 rounded-xl bg-neutral-100 py-4">
                    {/* Show the services currently attached to the appointment */}
                    <div>
                        <p className="text-sm font-semibold text-black">
                            Servicios Actuales
                        </p>

                        <div className="mt-3 space-y-2">
                            {services.map((item) => (
                                <div
                                    key={item.service.id}
                                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                                >
                                    <span className="text-sm font-semibold text-black">
                                        ${item.bookedPrice.toLocaleString("es-CO")}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Show the add-ons currently attached to the appointment */}
                    <div className="mt-5">
                        <p className="text-sm font-semibold text-black">
                            Adicionales Actuales
                        </p>

                        {addons.length > 0 ? (
                            <div className="mt-3 space-y-2">
                                {addons.map((item) => (
                                    <div
                                        key={item.addon.id}
                                        className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                                    >
                                        <span className="text-sm text-neutral-700">
                                            {item.addon.nameEs}
                                        </span>

                                        <span className="text-sm font-semibold text-black">
                                            ${item.bookedPrice.toLocaleString("es-CO")}
                                        </span>
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
        </div>
    );
}