"use client";

import { useLanguage } from "@/context/LanguageContext";

export default function BookPage() {
    const { language } = useLanguage();

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
                        ? "Selecciona los servicios que desas reservar."
                        : "Select the services you would like to book."}
                </p>
            </div>
        </main>
    )
}