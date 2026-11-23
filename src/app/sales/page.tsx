import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalHeader from "@/components/InternalHeader";
import SalesPageClient from "./SalesPageClient";
import { Suspense } from "react";

export default async function SalesPage() {
    const session = await auth();

    if (
        !session?.user ||
        (
            session.user.role !== "OWNER" &&
            session.user.role !== "RECEPTIONIST"
        )
    ) {
        redirect("/login");
    }

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-7xl">
                <InternalHeader
                  userRole={session.user.role}
                  userName={session.user.name}
                />

                <section className="mt-7 mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1F5A43]">TEFF Staff</p>
                  <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Historial de Ventas</h1>
                  <p className="mt-2 text-sm text-neutral-600">Consulta las ventas completadas, pagos, propinas y producción por técnica de TEFF.</p>
                </section>
                <Suspense fallback={
                    <p className="mt-6 text-sm text-neutral-500">
                        Cargando historial de ventas...
                    </p>
                }>
                    <SalesPageClient userRole={session.user.role} />
                </Suspense>
            </div>
        </main>
    );
}