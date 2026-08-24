"use client";

import Link from "next/link";
import { useState } from React; 
 
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-100 px-6">
      <div className="flex flex-col items-center text-center">
        <h1 className="text-5xl font-bold tracking-wide text-black">
          TEFF
        </h1>
        <p className="mt-3 text-lg text-neutral-600">
          Beauty Salon
        </p>
        <Link
         href="/book"
         className="mt-8 rounded-xl bg-black px-6 py-3 font-medium text-white">
          Book Appointment
        </Link>
      </div>
    </main>
  )
}
