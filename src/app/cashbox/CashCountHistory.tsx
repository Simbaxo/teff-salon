"use client";

import { useEffect, useState } from "react";

type CashCount = {
  id: number;
  countedAmount: number;
  expectedAmount: number;
  difference: number;
  notes: string | null;
  createdAt: string;
  countedBy: {
    id: number;
    name: string;
  };
};

type CountsResponse = {
  initialized: boolean;
  counts: CashCount[];
};

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

export default function CashCountHistory() {
  const [counts, setCounts] = useState<CashCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCounts() {
      try {
        const response = await fetch("/api/cashbox/counts", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("No se pudo consultar el historial de conteos.");
        }

        const data: CountsResponse = await response.json();

        if (
          typeof data.initialized !== "boolean" ||
          !Array.isArray(data.counts)
        ) {
          throw new Error("La respuesta del historial no es válida.");
        }

        if (controller.signal.aborted) return;

        setInitialized(data.initialized);
        setCounts(data.counts);
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "Ocurrió un error al consultar los conteos.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadCounts();

    return () => controller.abort();
  }, []);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-black">Historial de conteos</h2>

      <p className="mt-2 text-sm text-neutral-600">
        Consulta los últimos 50 conteos físicos y sus diferencias.
      </p>

      {isLoading ? (
        <p className="mt-5 text-sm text-neutral-600">Cargando conteos...</p>
      ) : error ? (
        <p role="alert" className="mt-5 text-sm text-red-700">
          {error}
        </p>
      ) : !initialized ? (
        <p className="mt-5 text-sm text-neutral-600">
          La caja todavía no está activada.
        </p>
      ) : counts.length === 0 ? (
        <p className="mt-5 text-sm text-neutral-600">
          Todavía no hay conteos registrados.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {counts.map((count) => (
            <article
              key={count.id}
              className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-black">
                    {count.difference === 0
                      ? "Caja cuadrada"
                      : count.difference < 0
                        ? "Faltante de efectivo"
                        : "Sobrante de efectivo"}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500">
                    {formatDate(count.createdAt)}
                  </p>
                </div>

                <p
                  className={`text-lg font-bold ${
                    count.difference < 0
                      ? "text-red-700"
                      : count.difference > 0
                        ? "text-amber-700"
                        : "text-green-700"
                  }`}
                >
                  {count.difference > 0 ? "+" : ""}
                  {formatCOP(count.difference)}
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-neutral-500">Saldo esperado</p>
                  <p className="mt-1 font-semibold text-black">
                    {formatCOP(count.expectedAmount)}
                  </p>
                </div>

                <div>
                  <p className="text-neutral-500">Efectivo contado</p>
                  <p className="mt-1 font-semibold text-black">
                    {formatCOP(count.countedAmount)}
                  </p>
                </div>
              </div>

              {count.notes && (
                <p className="mt-3 break-words text-sm text-neutral-700">
                  Observaciones: {count.notes}
                </p>
              )}

              <p className="mt-3 text-xs text-neutral-500">
                Registrado por: {count.countedBy.name}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
