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
    appointmentId: number;
    services: CheckoutService[];
    addons: CheckoutAddon[];
}

// Payment methods currently accepted by TEFF
type PaymentMethod = "CASH" | "BOLD" | "TRANSFER";

export default function CheckoutEditor({
    appointmentId,
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
    // Stores how much was paid using each payment method
    const [payments, setPayments] = useState({
        CASH: 0,
        BOLD: 0,
        TRANSFER: 0,
    });
    // Prevents duplicate checkout submissions while the sale is saving
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Displays a checkout error without losing the entered information
    const [checkoutError, setCheckoutError] = useState("");
    
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

    // Total amount entered across all payment methods
    const amountPaid =
        payments.CASH +
        payments.BOLD +
        payments.TRANSFER;
    
    // How much the customer still owes
    const remainingBalance = Math.max(finalTotal - amountPaid, 0);

    // Prevent staff from recording more money than the checkout total
    const overpayment = Math.max(amountPaid - finalTotal, 0);

    // Checkout is ready only when the total is paid exactly
    const canCompleteCheckout =
        selectedServices.length > 0 &&
        finalTotal > 0 &&
        remainingBalance === 0 &&
        overpayment === 0;

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

    // Send the verified checkout information to the server
    async function handleCompleteCheckout() {
        if (!canCompleteCheckout || isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setCheckoutError("");

        try {
            // Convert our payment object into database payment records
            const paymentsToSubmit = (
                Object.entries(payments) as [PaymentMethod, number] []
            )
                .filter(([, amount]) => amount > 0)
                .map(([paymentMethod, amount]) => ({
                    paymentMethod,
                    amount,
                }));

                const response = await fetch("/api/checkout", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        appointmentId,
                        serviceIds: selectedServices.map(
                            (item) => item.service.id    
                        ),
                        addonIds: selectedAddons.map(
                            (item) => item.addon.id
                        ),
                        discountTotal: discount,
                        payments: paymentsToSubmit,
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error || "No se pudo finalizar la venta"
                    );
                }

                console.log("Venta creada:", data);
        } catch (error) {
            setCheckoutError(
                error instanceof Error
                    ? error.message
                    : "No se pudo finalizar la venta"
            );
        } finally {
            setIsSubmitting(false);
        }
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

            {/* Enter how much the customer paid with each method */}
            <div className="mt-3 space-y-3">
                <div>
                    <label className="text-sm font-medium text-black">
                        Efectivo
                    </label>

                    <input 
                        type="number"
                        min="0"
                        value={payments.CASH}
                        onChange={(event) => 
                            setPayments((current) => ({
                                ...current,
                                CASH: Number(event.target.value),
                            }))
                        } 
                        className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                    />
                </div>

                <div>
                    <label className="text-sm font-medium text-black">
                        Bold / Tarjeta
                    </label>

                    <input 
                        type="number"
                        min="0"
                        value={payments.BOLD}
                        onChange={(event) => 
                            setPayments((current) => ({
                                ...current,
                                BOLD: Number(event.target.value),
                            }))
                        } 
                        className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                    />
                </div>

                <div>
                    <label className="text-sm font-medium text-black">
                        Transferencia
                    </label>

                    <input 
                        type="number"
                        min="0"
                        value={payments.TRANSFER}
                        onChange={(event) => 
                            setPayments((current) => ({
                                ...current,
                                TRANSFER: Number(event.target.value),
                            }))
                        } 
                        className="mt-1 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                    />
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

            {/* Warn staff if the entered payments are greater than the total */}
            {overpayment > 0 && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p03">
                    <p className="text-sm font-semibold text-red-700">
                        Pago Excedido
                    </p>

                    <p className="mt-1 text-sm text-red-200">
                        El pago supera el total por{" "}
                        ${overpayment.toLocaleString("es-CO")}.
                    </p>
                </div>
            )}

            {/* Temporary checkout readiness indicator */}
            <div className="mt-4">
                <p
                    className={`text-sm font-semibold ${
                        canCompleteCheckout
                            ? "text-green-700"
                            : "text-neutral-500"
                    }`}
                >
                    {canCompleteCheckout
                        ? "Listo para finalizar la venta"
                        : "Completa el pago para continuar"
                    }
                </p>
            </div>

            {/* Complete checkout only when payment and service validation passes */}
            <button
                type="button"
                onClick={handleCompleteCheckout}
                disabled={!canCompleteCheckout || isSubmitting}
                className="mt-4 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled: opacity-40"
            >
                {isSubmitting ? "Guardando Venta..." : "Finalizar Venta"}
            </button>

            {checkoutError && (
                <p className="mt-3 text-sm font-semibold text-red-600">
                    {checkoutError}
                </p>
            )}

        </div>
    );
}