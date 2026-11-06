import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
import AdminNav from "@/components/AdminNav";
import ExpensesWorkspace from "./ExpensesWorkspace";

export default async function ExpensesPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "OWNER") {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-neutral-100 p-4 md:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-black">Finanzas TEFF</h1>

        <p className="mt-2 text-neutral-600">
          Consulta ingresos, gastos y utilidad estimada del salón.
        </p>

        <div className="mt-4">
          <InternalNav userRole={session.user.role} />
        </div>

        <div className="mt-6">
          <AdminNav userRole={session.user.role} />
        </div>

        <ExpensesWorkspace />
      </div>
    </main>
  );
}
