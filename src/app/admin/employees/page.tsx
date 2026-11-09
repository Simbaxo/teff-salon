import { auth } from "@/auth";
import { redirect } from "next/navigation";
import InternalNav from "@/components/InternalNav";
import AdminNav from "@/components/AdminNav";
import EmployeesManager from "./EmployeesManager";

export default async function EmployeesPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== "OWNER") {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-neutral-900">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <header>
          <h1 className="text-3xl font-bold text-black">Gestión de Personal</h1>

          <p className="mt-2 text-neutral-600">
            Administra empleados, estados y disponibilidad para reservas.
          </p>
        </header>

        <InternalNav userRole="OWNER" />
        <AdminNav userRole="OWNER" />

        <EmployeesManager />
      </div>
    </main>
  );
}
