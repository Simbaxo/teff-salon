import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import InternalHeader from "@/components/InternalHeader";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import CustomerSearchForm from "./CustomerSearchForm";

type CustomersPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  const session = await auth();

  if (!session?.user) redirect("/login");

  const role = session.user.role;

  if (!canManageStaff(role) || (role !== "OWNER" && role !== "RECEPTIONIST")) {
    notFound();
  }

  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const phoneDigits = /^[+\d\s().-]+$/.test(query)
    ? query.replace(/\D/g, "")
    : "";
  const canSearch = phoneDigits ? phoneDigits.length >= 3 : query.length >= 2;

  const customers = canSearch
    ? await prisma.customer.findMany({
        where: phoneDigits
          ? { phone: { contains: phoneDigits } }
          : { name: { contains: query, mode: "insensitive" } },
        select: { id: true, name: true, phone: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: 31,
      })
    : [];

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-8 text-black sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <InternalHeader userRole={role} userName={session.user.name} />

        <section className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1F5A43]">
            TEFF Staff
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
            Clientes
          </h1>

          <p className="mt-2 text-sm text-neutral-600">
            Busca clientes por nombre o teléfono y consulta su historial.
          </p>
        </section>

        <CustomerSearchForm query={query} />

        {!canSearch && (
          <p className="text-sm text-neutral-600">
            Escribe al menos 2 letras del nombre o 3 dígitos del teléfono.
          </p>
        )}

        {canSearch && customers.length === 0 && (
          <p className="text-sm text-neutral-600">
            No se encontraron clientes para esa búsqueda.
          </p>
        )}

        {customers.length > 0 && (
          <ul className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200 bg-white">
            {customers.slice(0, 30).map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/staff/customers/${customer.id}`}
                  className="flex min-h-14 items-center justify-between gap-4 rounded-xl px-4 py-3 hover:bg-neutral-50"
                >
                  <span>
                    <span className="block font-semibold">{customer.name}</span>
                    {customer.phone && (
                      <span className="block text-sm text-neutral-600">
                        {customer.phone}
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {customers.length > 30 && (
          <p className="text-sm text-neutral-600">
            Se muestran 30 resultados. Agrega más letras o dígitos para acotar
            la búsqueda.
          </p>
        )}
      </div>
    </main>
  );
}
