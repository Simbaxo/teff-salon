"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type InternalNavProps = {
  userRole: "OWNER" | "RECEPTIONIST" | "TECHNICIAN";
};

type NavigationItem = {
  href: string;
  label: string;
};

const primaryItems: NavigationItem[] = [
  { href: "/staff", label: "Agenda" },
  { href: "/receptionist", label: "Recepción" },
  { href: "/sales", label: "Ventas" },
];

const secondaryItems: NavigationItem[] = [
  { href: "/staff/customers", label: "Clientes" },
  { href: "/inventory", label: "Inventario" },
  { href: "/cashbox", label: "Caja" },
  { href: "/reviews", label: "Reseñas" },
];

function isActivePath(pathname: string, href: string) {
  // Staff subpages have their own navigation destinations.
  // Do not highlight Agenda when viewing Clientes.
  if (href === "/staff") {
    return pathname === "/staff";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function InternalNav({ userRole }: InternalNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const canManage = userRole === "OWNER" || userRole === "RECEPTIONIST";

  const items: NavigationItem[] = [
    primaryItems[0],
    ...(canManage ? primaryItems.slice(1) : []),
    ...(canManage ? secondaryItems : []),
    ...(userRole === "OWNER" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  const compactItems = items.filter((item) =>
    primaryItems.some((primary) => primary.href === item.href),
  );

  const moreItems = items.filter(
    (item) => !primaryItems.some((primary) => primary.href === item.href),
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function navClass(href: string) {
    return [
      "inline-flex min-h-10 items-center justify-center",
      "whitespace-nowrap rounded-xl px-3 py-2",
      "text-sm font-medium transition-colors",
      isActivePath(pathname, href)
        ? "bg-[#B76E79] text-white"
        : "text-neutral-700 hover:bg-rose-50",
    ].join(" ");
  }

  return (
    <>
      {/* Mobile: hamburger button and slide-out navigation */}
      <div className="md:hidden">
        <button
          type="button"
          aria-label="Abrir menú de navegación"
          aria-expanded={mobileOpen}
          aria-controls="teff-mobile-navigation"
          onClick={() => setMobileOpen(true)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-neutral-200 bg-white text-xl text-neutral-800"
        >
          ☰
        </button>

        {mobileOpen && (
          <div className="fixed inset-0 z-[100]">
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-black/45"
            />

            <nav
              id="teff-mobile-navigation"
              aria-label="Navegación interna"
              className="absolute inset-y-0 left-0 flex w-[min(85vw,320px)] flex-col bg-white p-5 shadow-2xl"
            >
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <p className="text-2xl font-bold tracking-tight text-neutral-900">
                    TEFF
                  </p>
                  <p className="text-xs tracking-widest text-neutral-500">
                    BEAUTY SALON
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Cerrar navegación"
                  onClick={() => setMobileOpen(false)}
                  className="min-h-11 min-w-11 rounded-xl border border-neutral-200 text-xl text-neutral-800"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`${navClass(item.href)} !justify-start`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </nav>
          </div>
        )}
      </div>

      {/* iPad portrait: priority tabs and Más dropdown */}
      <nav
        aria-label="Navegación interna"
        className="hidden flex-wrap items-center gap-1 md:flex lg:hidden"
      >
        {compactItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={navClass(item.href)}
          >
            {item.label}
          </Link>
        ))}

        {moreItems.length > 0 && (
          <details className="group relative">
            <summary
              className={[
                "flex min-h-10 cursor-pointer list-none items-center",
                "rounded-xl px-3 py-2 text-sm font-medium",
                "marker:content-none [&::-webkit-details-marker]:hidden",
                moreItems.some((item) => isActivePath(pathname, item.href))
                  ? "bg-[#B76E79] text-white"
                  : "text-neutral-700 hover:bg-rose-50",
              ].join(" ")}
            >
              Más
              <span className="ml-2 text-xs">▾</span>
            </summary>

            <div className="absolute right-0 top-full z-50 mt-2 flex min-w-44 flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg">
              {moreItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navClass(item.href)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </details>
        )}
      </nav>

      {/* iPad landscape and desktop: full top navigation */}
      <nav
        aria-label="Navegación interna"
        className="hidden flex-wrap items-center gap-1 lg:flex"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={navClass(item.href)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
