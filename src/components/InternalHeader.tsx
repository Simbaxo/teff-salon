"use client";

import { signOut } from "next-auth/react";
import InternalNav from "./InternalNav";

type InternalHeaderProps = {
  userRole: "OWNER" | "RECEPTIONIST" | "TECHNICIAN";
  userName?: string | null;
};

export default function InternalHeader({
  userRole,
  userName,
}: InternalHeaderProps) {
  return (
    <header className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
        {/* Branding and mobile navigation */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="md:hidden">
            <InternalNav userRole={userRole} />
          </div>

          <div className="shrink-0">
            <p className="text-2xl font-bold tracking-tight text-neutral-900">
              TEFF
            </p>
            <p className="text-[10px] font-medium tracking-[0.22em] text-neutral-500">
              BEAUTY SALON
            </p>
          </div>
        </div>

        {/* Account controls */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden text-right sm:block">
            {userName && (
              <p className="text-sm font-semibold text-neutral-800">
                {userName}
              </p>
            )}

            <p className="text-xs text-neutral-500">
              {userRole === "OWNER"
                ? "Administrador"
                : userRole === "RECEPTIONIST"
                  ? "Recepción"
                  : "Técnica"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="min-h-11 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            Salir
          </button>
        </div>
      </div>

      {/* iPad and desktop navigation */}
      <div className="hidden border-t border-neutral-100 px-4 py-2 md:block sm:px-6">
        <InternalNav userRole={userRole} />
      </div>
    </header>
  );
}
