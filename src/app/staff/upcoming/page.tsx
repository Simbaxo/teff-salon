import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccessStaff } from "@/lib/auth-roles";
import InternalNav from "@/components/InternalNav";
import UpcomingAppointmentsClient from "./UpcomingAppointmentsClient";

export default async function UpcomingAppointmentsPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    if (!canAccessStaff(session.user.role)) {
        redirect("/login");
    }

    return (
        <main className="min-h-screen bg-neutral-100 p-6">
            <div className="mx-auto max-w-5xl">
                <h1 className="text-3xl font-bold text-black">
                    Próximas Citas
                </h1>

                <p className="mt-2 text-neutral-600">
                    Todas las citas programadas a futuro.
                </p>

                <div className="mt-4">
                    <InternalNav userRole={session.user.role} />
                </div>

                <UpcomingAppointmentsClient />
            </div>
        </main>
    );
}