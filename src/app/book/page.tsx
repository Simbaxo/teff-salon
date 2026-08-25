"use client";

import { useState } from "react";
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

export default function BookPage() {
    const { language } = useLanguage();
    const [selectedServices, setSelectedServices] = useState<number[]>([]);

    function toggleService(serviceId: number) {
        setSelectedServices((current) =>
            current.includes(serviceId)
                ? current.filter((id) => id !== serviceId)
                : [...current, serviceId]
        );
    }

    // Find Selected Services
    const selectedServiceDetails = services.filter((service) =>
        selectedServices.includes(service.id)
    );

    // Calculate Price
    const totalPrice = selectedServiceDetails.reduce(
        (total, service) => total + service.price,
        0
    );

    // Calculate Duration
    const totalDuration = selectedServiceDetails.reduce(
        (total, service) => total + service.duration,
        0
    )

    return (
        <main className="min-h-screen bg-neutral-100 px-6 py-12">
            <div className="mx-auto max-w-2xl">
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