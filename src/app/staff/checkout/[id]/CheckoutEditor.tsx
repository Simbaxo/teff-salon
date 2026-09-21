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

type CheckoutVisitAppointment = {
    id: number;
    employeeId: number;

    employee: {
        id: number;
        name: string;
    };

    appointmentServices: CheckoutService[];
    appointmentAddons: CheckoutAddon[];
};

type CheckoutEditorProps = {
    appointmentId: number;
    visitAppointments: CheckoutVisitAppointment[];
};

// Payment methods currently accepted by TEFF
type PaymentMethod = "CASH" | "BOLD" | "TRANSFER";

// Information returned after the sale is successfully saved
type CompletedSale = {
    saleId: number;
    finalTotal: number;
    commissionAmount: number;
}

export default function CheckoutEditor({
    appointmentId,
    visitAppointments,
}: CheckoutEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    // Start checkout with every service from the complete customer visit.
    const [selectedServices, setSelectedServices] =
        useState<CheckoutService[]>(
            visitAppointments.flatMap(
                (visitAppointment) =>
                    visitAppointment.appointmentServices
            )
        );

    // Start checkout with every add-on from the complete customer visit.
    const [selectedAddons, setSelectedAddons] =
        useState<CheckoutAddon[]>(
            visitAppointments.flatMap(
                (visitAppointment) =>
                    visitAppointment.appointmentAddons
            )
        );
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
    type TechnicianTip = {
    amount: number;
    paymentMethod: PaymentMethod;
};

    // Each technician working on the visit can receive their own tip.
    const [tipsByEmployee, setTipsByEmployee] = useState<
        Record<number, TechnicianTip>
    >(() => {
        const initialTips: Record<number, TechnicianTip> = {};

        for (const visitAppointment of visitAppointments) {
            if (!initialTips[visitAppointment.employeeId]) {
                initialTips[visitAppointment.employeeId] = {
                    amount: 0,
                    paymentMethod: "CASH",
                };
            }
        }

        return initialTips;
    });
    // Prevents duplicate checkout submissions while the sale is saving
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Displays a checkout error without losing the entered information
    const [checkoutError, setCheckoutError] = useState("");
    // Stores the completed sale so the checkout cannot be submitted again
    const [completedSale, setCompletedSale] =
        useState<CompletedSale | null>(null);
    
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

    // Cash tips go directly to technicians.
    // Electronic tips are collected by TEFF and must be included in checkout.
    const electronicTip = Object.values(tipsByEmployee).reduce(
        (total, tip) =>
            tip.paymentMethod === "CASH"
                ? total
                : total + tip.amount,
        0
    );

    // Total tips across every technician working on this visit.
    const totalTips = Object.values(tipsByEmployee).reduce(
        (total, tip) => total + tip.amount,
        0
    );

    // Total amount TEFF must actually collect
    const amountDue = finalTotal + electronicTip;

    // payments.BOLD represents the sale/tip amount allocated to Bold
    // before the customer-paid processing fee.
    const boldBase = payments.BOLD;

    // Bold charges the customer a flat $5,000 up to $100,000.
    // Above $100,000, the customer pays 5% of the Bold amount.
    const boldProcessingFee =
        boldBase <= 0
            ? 0
            : boldBase <= 100000
                ? 5000
                : Math.round(boldBase * 0.05);

    // Actual amount charged to the customer's card.
    const boldCustomerCharge =
        boldBase + boldProcessingFee;

    const amountPaid = Object.values(payments).reduce(
        (total, amount) => total + amount,
        0
    );

    const remainingBalance = Math.max(amountDue - amountPaid, 0);
    const overpayment = Math.max(amountPaid - amountDue, 0)

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

                        // Every appointment block belonging to this customer visit
                        appointmentIds: visitAppointments.map(
                            (visitAppointment) => visitAppointment.id
                        ),
                        serviceIds: selectedServices.map(
                            (item) => item.service.id    
                        ),
                        addonIds: selectedAddons.map(
                            (item) => item.addon.id
                        ),
                        discountTotal: discount,
                        payments: paymentsToSubmit,
                        
                        // Send tip details separately from service revenue
                        tips: Object.entries(tipsByEmployee)
                            .filter(([, tip]) => tip.amount > 0)
                            .map(([employeeId, tip]) => ({
                                employeeId: Number(employeeId),
                                amount: tip.amount,
                                paymentMethod: tip.paymentMethod,
                            })),
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.error || "No se pudo finalizar la venta"
                    );
                }

                // Save the successful result and switch to the confirmation screen
                setCompletedSale(data);
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

    // Once checkout succeeds, replace the editor with a confirmation screen
    if (completedSale) {
        return (
            <div className="mt-6 rounded-xl border border-neutral-200 p-6 text-center">
                <p className="text-2xl font-bold text-black">
                    Venta Registrada ✅
                </p>

                <p className="mt-2 text-sm text-neutral-500">
                    La venta fue guardada correctamente.
                </p>

                <div className="mt-6 rounded-xl bg-neutral-100 p-4">
                    <p className="text-sm text-neutral-500">
                        Venta #{completedSale.saleId}
                    </p>

                    <p className="mt01 text-2xl font-bold text-black">
                        ${completedSale.finalTotal.toLocaleString("es-CO")}
                    </p>
                </div>
            </div>
        );
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

            {/* Tips are assigned directly to the technicians who worked on the visit. */}
            <div className="mt-6">
                <p className="font-semibold text-black">
                    Propinas
                </p>

                <p className="mt-1 text-sm text-neutral-500">
                    Registra la propina correspondiente a cada técnica.
                </p>

                <div className="mt-4 space-y-4">
                    {Object.entries(tipsByEmployee).map(
                        ([employeeIdText, tip]) => {
                            const employeeId = Number(employeeIdText);

                            const employeeName =
                                visitAppointments.find(
                                    (visitAppointment) =>
                                        visitAppointment.employeeId === employeeId
                                )?.employee.name ?? "Técnica";

                            return (
                                <div
                                    key={employeeId}
                                    className="rounded-xl border border-neutral-200 p-4"
                                >
                                    <p className="font-semibold text-black">
                                        {employeeName}
                                    </p>

                                    <label
                                        htmlFor={`tip-${employeeId}`}
                                        className="mt-3 block text-sm font-medium text-black"
                                    >
                                        Propina
                                    </label>

                                    <input
                                        id={`tip-${employeeId}`}
                                        type="number"
                                        min="0"
                                        value={tip.amount}
                                        onChange={(event) => {
                                            const amount = Number(
                                                event.target.value
                                            );

                                            setTipsByEmployee((current) => ({
                                                ...current,
                                                [employeeId]: {
                                                    ...current[employeeId],
                                                    amount,
                                                },
                                            }));
                                        }}
                                        className="mt-1 w-full rounded-lg border border-neutral-300 p-3 text-black"
                                    />

                                    <label
                                        htmlFor={`tip-method-${employeeId}`}
                                        className="mt-3 block text-sm font-medium text-black"
                                    >
                                        Método de la propina
                                    </label>

                                    <select
                                        id={`tip-method-${employeeId}`}
                                        value={tip.paymentMethod}
                                        onChange={(event) => {
                                            const paymentMethod =
                                                event.target.value as PaymentMethod;

                                            setTipsByEmployee((current) => ({
                                                ...current,
                                                [employeeId]: {
                                                    ...current[employeeId],
                                                    paymentMethod,
                                                },
                                            }));
                                        }}
                                        className="mt-1 w-full rounded-lg border border-neutral-300 p-3 text-black"
                                    >
                                        <option value="CASH">
                                            Efectivo
                                        </option>

                                        <option value="BOLD">
                                            Bold / Tarjeta
                                        </option>

                                        <option value="TRANSFER">
                                            Transferencia
                                        </option>
                                    </select>
                                </div>
                            );
                        }
                    )}
                </div>

                {totalTips > 0 && (
                    <div className="mt-4 flex justify-between text-sm">
                        <span className="text-neutral-600">
                            Total propinas
                        </span>

                        <span className="font-semibold text-black">
                            ${totalTips.toLocaleString("es-CO")}
                        </span>
                    </div>
                )}
            </div>

            {/* Amount that will actually be charged to the customer */}
            <div className="mt-5 border-t border-neutral-200 pt-4">
                <div className="flex items-center justify-between">
                    <span className="font-semibold text-black">
                        Total a Cobrar
                    </span>

                    <span className="text-xl font-bold text-black">
                        ${amountDue.toLocaleString("es-CO")}
                    </span>
                </div>
                    
                    {/* Explain when an electronic tip is included */}
                    {electronicTip > 0 && (
                        <p className="mt-1 text-sm text-neutral-500">
                            Incluye ${electronicTip.toLocaleString("es-CO")} de propina
                        </p>
                    )}
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
                    
                    {payments.BOLD > 0 && (
                        <div className="mt-2 rounded-lg bg-neutral-100 p-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-neutral-600">
                                    Cargo Bold
                                </span>

                                <span className="font-semibold text-black">
                                    +${boldProcessingFee.toLocaleString("es-CO")}
                                </span>
                            </div>

                            <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2">
                                <span className="font-semibold text-black">
                                    Total en tarjeta
                                </span>

                                <span className="font-semibold text-black">
                                    ${boldCustomerCharge.toLocaleString("es-CO")}
                                </span>
                            </div>
                        </div>
                    )}
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
                        ${amountDue.toLocaleString("es-CO")}
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