import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
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
            <div className="mx-auto max-w-6xl">
                <div>
                    <h1 className="text-3xl font-bold text-black">
                        Inventario
                    </h1>

                    <p className="mt-2 text-neutral-600">
                        Controla los insumos y productos de TEFF.
                    </p>

                    <div className="mt-4">
                        <InternalNav
                            userRole={session.user.role}
                        />
                    </div>
                </div>

                <InventoryPageClient />
            </div>
        </main>
    );
}