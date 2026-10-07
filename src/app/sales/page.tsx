import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
import SalesPageClient from "./SalesPageClient";

export default async function SalesPage() {
    const session = await auth();

    if (
        !session?.user ||
        !["OWNER", "RECEPTIONIST"].includes(
            session.user.role
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
                        propinas y comisiones de TEFF.
                    </p>

                    <div className="mt-4">
                        <InternalNav
                            userRole={session.user.role}
                        />
                    </div>
                </div>

                <SalesPageClient />
            </div>
        </main>
    );
}