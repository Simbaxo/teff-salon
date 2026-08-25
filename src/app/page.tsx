"use client";

import Link from "next/link";
import { useLanguage } from "@/context/LanguageContext";

export default function Home() {
  const { language, setLanguage } = useLanguage();

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-100 px-6">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setLanguage("es")}
            className={`rounded-md border px-3 py-1 ${
              language === "es"
                ? "bg-black text-white"
                : "bg-white text-black"
            }`}
          >
            ES
          </button>

          <button
            onClick={() => setLanguage("en")}
            className={`rounded-md border px-3 py-1 ${
              language === "en"
                ? "bg-black text-white"
                : "bg-white text-black"
            }`}
          >
            EN
          </button>
        </div>
        <h1 className="text-5xl font-bold tracking-wide text-black">
          TEFF
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          {language === "es" ? "Salon de Belleza" : "Beauty Salon"}
        </p>
        <Link
         href="/book"
         className="mt-8 rounded-xl bg-black px-6 py-3 font-medium text-white">
          {language === "es" ? "Reservar cita" : "Book Appointment"}
        </Link>
      </div>
    </main>
  )
}
