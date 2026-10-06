import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
import ServicesCatalogClient from "./ServicesCatalogClient";

export default async function ServicesCatalogPage() {
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
                        Catálogo de Servicios
                    </h1>

                    <p className="mt-2 text-neutral-600">
                        Gestiona los servicios, precios y disponibilidad de TEFF.
                    </p>

                    <div className="mt-4">
                        <InternalNav
                            userRole={session.user.role}
                        />
                    </div>
                </div>

                <ServicesCatalogClient />
            </div>
        </main>
    );
}