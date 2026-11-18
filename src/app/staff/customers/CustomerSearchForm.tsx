"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

function getSearchUrl(query: string): string {
  const value = query.trim();

  return value
    ? `/staff/customers?${new URLSearchParams({ q: value })}`
    : "/staff/customers";
}

export default function CustomerSearchForm({ query }: { query: string }) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (value.trim() === query) return;

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(getSearchUrl(value), { scroll: false });
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, router, value]);

  return (
    <form
      action="/staff/customers"
      method="get"
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();

        if (value.trim() !== query) {
          startTransition(() => {
            router.replace(getSearchUrl(value), { scroll: false });
          });
        }
      }}
    >
      <label htmlFor="customer-search" className="block text-sm font-semibold">
        Buscar por nombre o teléfono
      </label>

      <div className="flex flex-wrap gap-2">
        <input
          id="customer-search"
          name="q"
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={100}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-neutral-300 bg-white px-4"
        />
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-black px-5 font-semibold text-white"
        >
          Buscar
        </button>
      </div>

      <p role="status" className="min-h-5 text-sm text-neutral-600">
        {isPending ? "Buscando clientes…" : ""}
      </p>
    </form>
  );
}
