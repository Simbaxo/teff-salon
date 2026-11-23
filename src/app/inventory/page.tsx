import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalHeader from "@/components/InternalHeader";
import InventoryPageClient from "./InventoryPageClient";

export default async function InventoryPage() {
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
            <div className="mx-auto max-w-7xl">
                <InternalHeader
                  userRole={session.user.role}
                  userName={session.user.name}
                />

                <section className="mt-7 mb-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1F5A43]">TEFF Staff</p>
                  <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Inventario</h1>
                  <p className="mt-2 text-sm text-neutral-600">Controla los insumos y productos de TEFF.</p>
                </section>
                <InventoryPageClient />
            </div>
        </main>
    );
}