"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type InternalNavProps = {
    userRole:
        | "OWNER"
        | "RECEPTIONIST"
        | "TECHNICIAN";
};

type NavLinkProps = {
    href: string;
    label: string;
    pathname: string;
};

function NavLink({
    href,
    label,
    pathname,
}: NavLinkProps) {
    const isActive =
        pathname === href ||
        pathname.startsWith(`${href}/`);

    return (
        <Link
            href={href}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                    ? "border-[#B76E79] bg-[#B76E79] text-white"
                    : "border-neutral-300 bg-white text-black hover:bg-neutral-100"
            }`}
        >
            {label}
        </Link>
    );
}

export default function InternalNav({
    userRole,
}: InternalNavProps) {
    const pathname = usePathname();

    return (
        <nav className="flex flex-wrap gap-2">
            <NavLink
                href="/staff"
                label="Staff"
                pathname={pathname}
            />

            {(userRole === "OWNER" ||
                userRole === "RECEPTIONIST") && (
                <>
                    <NavLink
                        href="/receptionist"
                        label="Recepción"
                        pathname={pathname}
                    />

                    <NavLink
                        href="/sales"
                        label="Ventas"
                        pathname={pathname}
                    />

                    <NavLink
                        href="/inventory"
                        label="Inventario"
                        pathname={pathname}
                    />

                    <NavLink
                        href="/catalog/services"
                        label="Catálogo"
                        pathname={pathname}
                    />
                </>
            )}

            {userRole === "OWNER" && (
                <NavLink
                    href="/admin"
                    label="Admin"
                    pathname={pathname}
                />
            )}
        </nav>
    );
}