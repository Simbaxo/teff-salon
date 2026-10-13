"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminLinkProps = {
    href: string;
    label: string;
    pathname: string;
};

function AdminLink({
    href,
    label,
    pathname,
}: AdminLinkProps) {
    const isActive =
        href === "/admin"
            ? pathname === "/admin"
            : pathname === href ||
              pathname.startsWith(`${href}/`);

    return (
        <Link
            href={href}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                isActive
                    ? "bg-[#B76E79] text-white"
                    : "bg-white text-black hover:bg-neutral-100"
            }`}
        >
            {label}
        </Link>
    );
}

type AdminNavProps = {
    userRole: string;
};

export default function AdminNav({
    userRole,
}: AdminNavProps) {
    const pathname = usePathname();

    return (
        <nav className="flex flex-wrap gap-2">
            <AdminLink
                href="/admin"
                label="Hoy"
                pathname={pathname}
            />

            <AdminLink
                href="/admin/technicians"
                label="Técnicas"
                pathname={pathname}
            />

            {/* Payroll navigation is strictly OWNER-only. */}
            {userRole === "OWNER" && (
                <AdminLink
                    href="/admin/payroll"
                    label="Nómina"
                    pathname={pathname}
                />
            )}
        </nav>
    );
}