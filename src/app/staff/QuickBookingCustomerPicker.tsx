"use client";

import { useEffect, useState } from "react";

export type QuickBookingCustomer =
  | {
      kind: "existing";
      id: number;
      name: string;
      phone: string | null;
      email: string | null;
    }
  | {
      kind: "new";
      name: string;
      phone: string;
      email: string;
    };

type ExistingCustomer = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
};

type Props = {
  value: QuickBookingCustomer | null;
  onChange: (customer: QuickBookingCustomer | null) => void;
};

export default function QuickBookingCustomerPicker({ value, onChange }: Props) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExistingCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    if (mode !== "existing" || value?.kind === "existing") {
      return;
    }

    const phoneDigits = query.replace(/\D/g, "");
    const looksLikePhone = /^[+\d\s().-]+$/.test(query.trim());
    const minimumLength = looksLikePhone
      ? phoneDigits.length >= 3
      : query.trim().length >= 2;

    if (!minimumLength) {
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/staff/quick-booking/customers?q=${encodeURIComponent(query.trim())}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        const data = (await response.json()) as {
          customers?: ExistingCustomer[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudieron buscar clientes.");
        }

        if (!controller.signal.aborted) {
          setResults(data.customers ?? []);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron buscar clientes.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, mode, value]);

  function switchMode(next: "existing" | "new") {
    setMode(next);
    setResults([]);
    setError("");
    onChange(null);

    if (next === "new") {
      onChange({
        kind: "new",
        name: newName,
        phone: newPhone,
        email: newEmail,
      });
    }
  }

  function updateNewCustomer(name: string, phone: string, email: string) {
    setNewName(name);
    setNewPhone(phone);
    setNewEmail(email);

    onChange({
      kind: "new",
      name,
      phone,
      email,
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => switchMode("existing")}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${
            mode === "existing"
              ? "bg-[#1F5A43] text-white"
              : "border border-neutral-300 bg-white text-black"
          }`}
        >
          Buscar cliente
        </button>

        <button
          type="button"
          onClick={() => switchMode("new")}
          className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${
            mode === "new"
              ? "bg-[#1F5A43] text-white"
              : "border border-neutral-300 bg-white text-black"
          }`}
        >
          Cliente nuevo
        </button>
      </div>

      {mode === "existing" ? (
        <div className="space-y-3">
          {value?.kind === "existing" ? (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <p className="font-semibold text-black">{value.name}</p>
              <p className="text-sm text-neutral-600">
                {value.phone ?? "Sin teléfono"}
              </p>

              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setQuery("");
                  setResults([]);
                }}
                className="mt-3 text-sm font-semibold text-[#1F5A43]"
              >
                Cambiar cliente
              </button>
            </div>
          ) : (
            <>
              <label
                htmlFor="quick-booking-customer-search"
                className="block text-sm font-medium text-black"
              >
                Buscar por nombre o teléfono
              </label>

              <input
                id="quick-booking-customer-search"
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setResults([]);
                  setError("");
                }}
                placeholder="Nombre o celular"
                autoComplete="off"
                maxLength={100}
                className="min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-black"
              />

              {loading && (
                <p role="status" className="text-sm text-neutral-600">
                  Buscando clientes...
                </p>
              )}

              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}

              {results.length > 0 && (
                <ul className="max-h-64 divide-y divide-neutral-200 overflow-y-auto rounded-xl border border-neutral-200 bg-white">
                  {results.map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange({
                            kind: "existing",
                            ...customer,
                          });
                          setResults([]);
                        }}
                        className="flex min-h-14 w-full flex-col px-4 py-3 text-left hover:bg-neutral-50"
                      >
                        <span className="font-semibold text-black">
                          {customer.name}
                        </span>

                        <span className="text-sm text-neutral-600">
                          {customer.phone ?? "Sin teléfono"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {!loading &&
                !error &&
                query.trim().length >= 2 &&
                results.length === 0 && (
                  <p className="text-sm text-neutral-600">
                    No hay resultados. También puedes crear un cliente nuevo.
                  </p>
                )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label
              htmlFor="quick-booking-new-name"
              className="block text-sm font-medium text-black"
            >
              Nombre completo
            </label>

            <input
              id="quick-booking-new-name"
              value={newName}
              onChange={(event) =>
                updateNewCustomer(event.target.value, newPhone, newEmail)
              }
              maxLength={100}
              autoComplete="name"
              className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-black"
            />
          </div>

          <div>
            <label
              htmlFor="quick-booking-new-phone"
              className="block text-sm font-medium text-black"
            >
              Celular
            </label>

            <input
              id="quick-booking-new-phone"
              type="tel"
              value={newPhone}
              onChange={(event) =>
                updateNewCustomer(newName, event.target.value, newEmail)
              }
              maxLength={30}
              autoComplete="tel"
              placeholder="300 123 4567"
              className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-black"
            />
          </div>

          <div>
            <label
              htmlFor="quick-booking-new-email"
              className="block text-sm font-medium text-black"
            >
              Correo electrónico (opcional)
            </label>

            <input
              id="quick-booking-new-email"
              type="email"
              value={newEmail}
              onChange={(event) =>
                updateNewCustomer(newName, newPhone, event.target.value)
              }
              maxLength={254}
              autoComplete="email"
              className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-base text-black"
            />
          </div>
        </div>
      )}
    </section>
  );
}
