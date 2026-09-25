import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
import HistoricalSaleEditor from "./HistoricalSaleEditor";

export default async function HistoricalSalePage() {
    const session = await auth();

    // Historical financial entry is restricted to Owner and Receptionist.
    if (
        !session?.user ||
        !["OWNER", "RECEPTIONIST"].includes(session.user.role)
    ) {
        redirect("/login");
    }

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-5xl">
                <div>
                    <h1 className="text-3xl font-bold text-black">
                        Registrar Servicio Anterior
                    </h1>

                    <p className="mt-2 text-neutral-600">
                        Registra una cita y venta que ya ocurrió en el salón.
                    </p>

                    <div className="mt-4">
                        <InternalNav userRole={session.user.role} />
                    </div>
                </div>

                <HistoricalSaleEditor />
            </div>
        </main>
    );
}