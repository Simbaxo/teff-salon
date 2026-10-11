
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
import AdminNav from "@/components/AdminNav";
import PayrollPageClient from "./PayrollPageClient";

export default async function PayrollPage() {
    const session = await auth();

    // Payroll information is restricted to the Owner.
    if (
        !session?.user ||
        session.user.role !== "OWNER"
    ) {
        redirect("/login");
    }

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-6xl">
                <h1 className="text-3xl font-bold text-black">
                    Panel del Propietario
                </h1>

                <p className="mt-2 text-neutral-600">
                    Consulta la nómina semanal de TEFF Beauty Salon.
                </p>

                <div className="mt-4">
                    <InternalNav
                        userRole={session.user.role}
                    />
                </div>

                <div className="mt-6">
                    <AdminNav />
                </div>

                <PayrollPageClient />
            </div>
        </main>
    );
}
