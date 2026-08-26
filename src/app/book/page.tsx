"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/context/LanguageContext";

const services = [
    {
        id: 1,
        nameEs: "Manicure semipermanente",
        nameEn: "Gel manicure",
        category: "manicure",
        price: 60000,
        duration: 60,
    },
    {
        id: 2,
        nameEs: "Pedicure semipermanente",
        nameEn: "Gel pedicure",
        category: "pedicure",
        price: 60000,
        duration: 60,
    },
    {
        id: 3,
        nameEs: "Base Rubber",
        nameEn: "Rubber Base",
        category: "manicure",
        price: 100000,
        duration: 90,
    },
];

const addons = [
    {
        id: 1,
        nameEs: "French",
        nameEN: "French",
        price: 20000,
        duration: 15,
    },
    {
        id: 2,
        nameEs: "Retiro",
        nameEn: "Removal",
        price: 10000,
        duration: 15,
    },
    {
        id: 3,
        nameEs: "Nail Art",
        nameEn: "Nail Art",
        price: 25000,
        duration: 20,
    },
];

const serviceAddons = [
    { serviceId: 1, addonId: 1 },
    { serviceId: 1, addonId: 2 },
    { serviceId: 1, addonId: 3 },

    { serviceId: 2, addonId: 1 },
    { serviceId: 2, addonId: 2 },

    { serviceId: 3, addonId: 1 },
    { serviceId: 3, addonId: 2 },
    { serviceId: 3, addonId: 3 },
];

export default function BookPage() {
    const { language } = useLanguage();
    const [selectedServices, setSelectedServices] = useState<number[]>([]);
    const [selectedAddons, setSelectedAddons] = useState<number[]>([]);
    
    const availableAddonIds = serviceAddons
        .filter((relation) => 
            selectedServices.includes(relation.serviceId)
        )
        .map((relation) => relation.addonId);

    // Remove invalid add-ons automatically
    useEffect(() => {
        const validAddonIds = serviceAddons
            .filter((relation) => 
                selectedServices.includes(relation.serviceId)
            )
            .map((relation) => relation.addonId)

        setSelectedAddons((current) =>
            current.filter((addonId) => availableAddonIds.includes(addonId))
        );
    }, [selectedServices]);

    const availableAddons = addons.filter((addon) => 
        availableAddonIds.includes(addon.id)
    );

    const selectedAddonDetails = addons.filter((addon) => 
        selectedAddons.includes(addon.id)
    );

    function toggleService(serviceId: number) {
        setSelectedServices((current) =>
            current.includes(serviceId)
                ? current.filter((id) => id !== serviceId)
                : [...current, serviceId]
        );
    }

    // Add-on Selection State
    function toggleAddon(addonId: number) {
        setSelectedAddons((current) =>
            current.includes(addonId)
                ? current.filter((id) => id !== addonId)
                : [...current, addonId]
        );
    }

    // Find Selected Services
    const selectedServiceDetails = services.filter((service) =>
        selectedServices.includes(service.id)
    );

    // Calculate Price
    const serviceTotal = selectedServiceDetails.reduce(
        (total, service) => total + service.price,
        0
    );

    const addonTotal = selectedAddonDetails.reduce(
        (total, addon) => total + addon.price,
        0
    );

    const totalPrice = serviceTotal + addonTotal;

    // Calculate Duration
    const serviceDuration = selectedServiceDetails.reduce(
        (total, service) => total + service.duration,
        0
    );

    const addonDuration = selectedServiceDetails.reduce(
        (total, addon) => total + addon.duration,
        0
    );

    const totalDuration = serviceDuration + addonDuration;

    return (
        <main className="min-h-screen bg-neutral-100 px-6 py-12">
            <div className="mx-auto max-w-2xl">
                {/* Heading */}
                <h1 className="text-3xl font-bold">
                    {language === "es"
                        ? "Reserva tu cita"
                        : "Book Your Appointment"}
                </h1>
                <p className="mt-2 text-neutral-600">
                    {language === "es"
                        ? "Selecciona los servicios que deseas reservar."
                        : "Select the services you would like to book."}
                </p>
                {/* Service Cards */}
                <div className="mt-8 space-y-4">
                    {services.map((service) => (
                        <button
                            key={service.id}
                            onClick={() => toggleService(service.id)}
                            className={`w-full rounded-xl border p-4 text-left ${
                                selectedServices.includes(service.id)
                                    ? "border-black bg-neutral-200"
                                    : "border-neutral-200 bg-white"
                                }`}
                        >
                            <h2 className="font-semibold text-black">
                                {language === "es" ? service.nameEs : service.nameEn}
                            </h2>
                            <p className="mt-1 text-sm text-neutral-600">
                                ${service.price.toLocaleString("es-CO")} COP
                            </p>
                            <p className="text-sm text-neutral-500">
                                {service.duration} min
                            </p>
                        </button>
                    ))}
                </div>

                {selectedServices.length > 0 && availableAddons.length > 0 && (
                    <div className="mt-8">
                        <h2 className="text-xl font-semibold text-black">
                            {language === "es" ? "Complemntos" : "Add-ons"}
                        </h2>

                        <p className="mt-1 text-sm text-neutral-600">
                            {language === "es" 
                                ? "Selecciona cualquier complemento que desees agregar."
                                : "Select any add-ons you would like to include."}
                        </p>

                        <div className="mt-4 space-y-3">
                            {availableAddons.map((addon) => (
                                <button
                                    key={addon.id}
                                    onClick={() => toggleAddon(addon.id)}
                                    className={`w-full rounded-xl border p-4 text-left ${
                                        selectedAddons.includes(addon.id)
                                        ? "border-black bg-neutral-200"
                                        : "border-neutral-200 bg-white"
                                    }`}
                                >

                                    <h3 className="font-semibold text-black">
                                        {language === "es" ? addon.nameEs : addon.nameEn}
                                    </h3>

                                    <p className="mt-1 text-sm text-neutral-600">
                                        +${addon.price.toLocaleString("es-CO")} COP
                                    </p>

                                    <p className="text-sm text-neutral-500">
                                        +{addon.duration} min
                                    </p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}



                {/* Summary */}
                {selectedServices.length > 0 && ( // Only show this section if at least one service is selected
                    <div className="mt-8 rounded-xl bg-white p-5">
                        <h2 className="font-semibold text-black">
                            {language === "es" ? "Tu seleccion" : "Your Selection"}
                        </h2>

                        <div className="mt-4 flex justify-between">
                            <span className="text-neutral-600">
                                {language === "es" ? "Precio estimado" : "Estimated Price"}
                            </span>

                            <span className="font-semibold text-black">
                                ${totalPrice.toLocaleString("es-CO")} COP
                            </span>
                        </div>

                        <div className="mt-2 flex justify-between">
                            <span className="text-neutral-600">
                                {language === "es" ? "Duracion estimada" : "Estimated Time"}
                            </span>

                            <span className="font-semibold text-black">
                                {totalDuration} min
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}