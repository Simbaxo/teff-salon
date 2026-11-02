import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
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
            <div className="mx-auto max-w-6xl">
                <div>
                    <h1 className="text-3xl font-bold text-black">
                        Historial de Ventas
                    </h1>

                    <p className="mt-2 text-neutral-600">
                        Consulta las ventas completadas, pagos,
                        propinas y producción por técnica de TEFF.
                    </p>

                    <div className="mt-4">
                        <InternalNav
                            userRole={session.user.role}
                        />
                    </div>
                </div>

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