import Link from "next/link";

type InternalNavProps = {
    userRole: "OWNER" | "RECEPTIONIST" | "TECHNICIAN";
};

export default function InternalNav({
    userRole,
}: InternalNavProps) {
    return (
        <nav className="flex flex-wrap gap-2">
            <Link
                href="/staff"
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100"
            >
                Staff
            </Link>

            {(userRole === "OWNER" || userRole === "RECEPTIONIST") && (
                <>
                    <Link
                        href="/receptionist"
                        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100"
                    >
                        Recepción
                    </Link>

                    <Link
                        href="/inventory"
                        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100"
                    >
                        Inventario
                    </Link>
                </>
            )}

            {userRole === "OWNER" && (
                <Link
                    href="/admin"
                    className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100"
                >
                    Admin
                </Link>
            )}
        </nav>
    );
}