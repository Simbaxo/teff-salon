import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalHeader from "@/components/InternalHeader";
import { canManageStaff } from "@/lib/auth-roles";
import CashboxDashboard from "./CashboxDashboard";

export default async function CashboxPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canManageStaff(session.user.role)) {
    redirect("/staff");
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
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">Caja de Efectivo</h1>
          <p className="mt-2 text-sm text-neutral-600">Controla el efectivo disponible, los movimientos de caja y los préstamos a las técnicas.</p>
        </section>
        <CashboxDashboard userRole={session.user.role} />
      </div>
    </main>
  );
}
