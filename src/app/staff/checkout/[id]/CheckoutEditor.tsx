"use client";

import { useEffect, useState } from "react";

type CheckoutService = {
    bookedPrice: number;
    service: {
        id: number;
        nameEs: string;
    };
};

// Represents an active service available in the salon enu
type AvailableService = {
    id: number;
    nameEs: string;
    price: number;
    estimatedDuration: number;
};

// Represents an active add-on available in the salon menu
type AvailableAddon = {
    id: number;
    nameEs: string;
    price: number;
    estimatedDuration: number;
}

// Connects a service to an add-on that is allowed for that service
type ServiceAddonRelation = {
    serviceId: number;
    addonId: number;
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

// Payment methods currently accepted by TEFF
type PaymentMethod = "CASH" | "BOLD" | "TRANSFER";

export default function CheckoutEditor({
    services,
    addons,
}: CheckoutEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    // Keep track of the services that will actually be charged
    const [selectedServices, setSelectedServices] = useState(services);
    // Keep track of the add-ons that will actually be charged
    const [selectedAddons, setSelectedAddons] = useState(addons);
    // Full active service menu used when staff needs to add something
    const [availableServices, setAvailableServices] = useState<AvailableService[]>(
        []
    );
    // Full active add-on menu used during checkout
    const [availableAddons, setAvailableAddons] = useState<AvailableAddon[]>([]);
    // Stores the valid service/add-on combinations from the database
    const [serviceAddonRelations, setServiceAddonRelations] = useState<
        ServiceAddonRelation[]
    >([]);
    // Discount entered by staff in Colombian pesos
    const [discount, setDiscount] = useState(0);
    // Stores the payment method selected by staff
    const [paymentMethod, setPaymentMethod] =
        useState<PaymentMethod | null>(null);
    
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

    // Never allow a discount to make the final total negative
    const finalTotal = Math.max(checkoutSubtotal - discount, 0);

    // For now, one selected payment method covers the full checkout total
    const amountPaid = paymentMethod ? finalTotal : 0;

    // Remaining balance must reach zero before checkout can be completed
    const remainingBalance = finalTotal - amountPaid;

    // Find which add-ons are valid for the services currently selected
    const allowedAddonIds = serviceAddonRelations
        .filter((relation) =>
            selectedServices.some(
                (item) => item.service.id === relation.serviceId
            )
        )
        .map((relation) => relation.addonId);
    
    // Only show add-ons that are allowed for the selected services
    const filteredAvailableAddons = availableAddons.filter((addon) =>
        allowedAddonIds.includes(addon.id)
    );

    // Load the active service and add-on menus for checkout
    useEffect(() => {
        async function loadMenu() {
            const servicesResponse = await fetch("/api/services");
            const addonsResponse = await fetch("/api/addons");
            const relationsResponse = await fetch("/api/service-addons");

            if (!servicesResponse.ok || 
                !addonsResponse.ok ||
                !relationsResponse.ok
            ) {
                console.error("No se pudieron cargar el menu del salon");
                return;
            }

            const servicesData = await servicesResponse.json();
            const addonsData = await addonsResponse.json();
            const relationsData = await relationsResponse.json();

            setAvailableServices(servicesData);
            setAvailableAddons(addonsData);
            setServiceAddonRelations(relationsData);
        }

        loadMenu();
    }, []);

    // Add a service to the final checkout selection
    function addService(service: AvailableService) {
        const alreadySelected = selectedServices.some(
            (item) => item.service.id === service.id
        );

        // Prevent the same service from being added twice
        if (alreadySelected) {
            return;
        }

        setSelectedServices((current) => [
            ...current,
            {
                bookedPrice: service.price,
                service: {
                    id: service.id,
                    nameEs: service.nameEs,
                },
            },
        ]);
    }

    // Remove a service and clean up add-ons that are no longer valid
    function removeService(serviceId: number) {
        const remainingServices = selectedServices.filter(
            (item) => item.service.id !== serviceId
        );

        // Find which add-ons are still allowed by the remaining services
        const remainingAllowedAddonIds = serviceAddonRelations
            .filter((relation) =>
                remainingServices.some(
                    (item) => item.service.id === relation.serviceId
                )
            )
            .map((relation) => relation.addonId);

        setSelectedServices(remainingServices);

        // Remove selected add-ons that no longer belong to any service
        setSelectedAddons((current) =>
            current.filter((item) =>
                remainingAllowedAddonIds.includes(item.addon.id)
            )
        )
    }

    // Add an add-on to the final checkout selection
    function addAddon(addon: AvailableAddon) {
        const alreadySelected = selectedAddons.some(
            (item) => item.addon.id === addon.id
        );

        // Prevent the same add-on from being added twice
        if (alreadySelected) {
            return;
        }

        setSelectedAddons((current) => [
            ...current,
            {
                bookedPrice: addon.price,
                addon: {
                    id: addon.id,
                    nameEs: addon.nameEs,
                },
            },
        ]);
    }

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
                                        onClick={() => removeService(item.service.id)}
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

                    {/* Staff can add a service that was not part of the original booking */}
                    <div className="mt-5">
                        <p className="text-sm font-semibold text-black">
                            Agregar Servicio
                        </p>

                        <div className="mt-3 space-y-2">
                            {availableServices.map((service) => {
                                const alreadySelected = selectedServices.some(
                                    (item) => item.service.id === service.id
                                );

                                return (
                                    <button
                                        key={service.id}
                                        type="button"
                                        onClick={() => addService(service)}
                                        disabled={alreadySelected}
                                        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left disabled:opacity-40"
                                    >
                                        <span className="text-sm text-neutral-700">
                                            {service.nameEs}
                                        </span>

                                        <span className="text-sm font-semibold text-black">
                                            ${service.price.toLocaleString("es-CO")}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Staff can add an add-on that was not part of the original booking */}
                    <div className="mt-5">
                        <p className="text-sm font-semibold text-black">
                            Agregar Adicional
                        </p>

                        <div className="mt-3 space-y-2">
                            {filteredAvailableAddons.map((addon) => {
                                const alreadySelected = selectedAddons.some(
                                    (item) => item.addon.id === addon.id
                                );

                                return (
                                    <button
                                        key={addon.id}
                                        type="button"
                                        onClick={() => addAddon(addon)}
                                        disabled={alreadySelected}
                                        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left disabled:opacity-40"
                                    >
                                        <span className="text-sm text-neutral-700">
                                            {addon.nameEs}
                                        </span>

                                        <span className="text-sm font-semibold text-black">
                                            ${addon.price.toLocaleString("es-CO")}
                                        </span>   
                                    </button>
                                );
                            })}
                        </div>
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

            {/* Staff can enter a fixed discount in COP */}
            <div className="mt-4">
                <label 
                    htmlFor="discount"
                    className="text-sm font-semibold text-black"
                >
                    Descuento
                </label>

                <input 
                    id="discount"
                    type="text"
                    min="0"
                    max={checkoutSubtotal}
                    value={discount}
                    onChange={(event) =>
                        setDiscount(Number(event.target.value))
                    }
                    className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                />
            </div>

            {/* Amount that will actually be charged to the customer */}
            <div className="mt-5 flex items-center justify-between border-t border-neutral-200 pt-4">
                <span className="font-semibold text-black">
                    Total a Cobrar
                </span>
                <span className="text-xl font-bold text-black">
                    ${finalTotal.toLocaleString("es-CO")}
                </span>
            </div>

            {/* Select how the customer is paying */}
            <div className="mt-6 border-t border-neutral-200 pt-5">
                <p className="text-sm font-semibold text-black">
                    Método de Pago
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                        type="button"
                        onClick={() => setPaymentMethod("CASH")}
                        className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                            paymentMethod === "CASH"
                                ? "border-black bg-black text-white"
                                : "border-neutral-300 bg-white text-black"
                        }`}
                    >
                        Efectivo
                    </button>

                    <button
                        type="button"
                        onClick={() => setPaymentMethod("BOLD")}
                        className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                            paymentMethod === "BOLD"
                                ? "border-black bg-black text-white"
                                : "border-neutral-300 bg-white text-black"
                        }`}
                    >
                        BOLD / Tarjeta
                    </button>

                    <button
                        type="button"
                        onClick={() => setPaymentMethod("TRANSFER")}
                        className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                            paymentMethod === "TRANSFER"
                                ? "border-black bg-black text-white"
                                : "border-neutral-300 bg-white text-black"
                        }`}
                    >
                        Transferencia
                    </button>
                </div>
            </div>

            {/* Show payment progress before completing checkout */}
            <div className="mt-5 rounded-xl bg-neutral-100 p-4">
                <div className="flex justify-between text-sm">
                    <span className="text-neutral-600">
                        Total a Pagar
                    </span>

                    <span className="font-semibold text-black">
                        ${finalTotal.toLocaleString("es-CO")}
                    </span>
                </div>

                <div className="mt-2 flex justify-between text-sm">
                    <span className="text-neutral-600">
                        Pagado
                    </span>

                    <span className="font-semibold text-black">
                        ${amountPaid.toLocaleString("es-CO")}
                    </span>
                </div>

                <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3">
                    <span className="font-semibold text-black">
                        Saldo Pendiente
                    </span>

                    <span className="font-semibold text-black">
                        ${remainingBalance.toLocaleString("es-CO")}
                    </span>
                </div>
            </div>
        </div>
    );
}