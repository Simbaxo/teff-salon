import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
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
      <div className="mx-auto max-w-6xl">
        <header>
          <h1 className="text-3xl font-bold text-black">Caja de Efectivo</h1>

          <p className="mt-2 text-neutral-600">
            Controla el efectivo disponible, los movimientos de caja y los
            préstamos a las técnicas.
          </p>

          <div className="mt-4">
            <InternalNav userRole={session.user.role} />
          </div>
        </header>

        <CashboxDashboard />
      </div>
    </main>
  );
}
