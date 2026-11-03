"use client";

import { useEffect, useState } from "react";

type MovementType =
  | "OWNER_WITHDRAWAL"
  | "BANK_DEPOSIT"
  | "CASH_EXPENSE"
  | "TECHNICIAN_LOAN"
  | "CASH_ADJUSTMENT_IN"
  | "CASH_ADJUSTMENT_OUT"
  | "REVERSAL";

type CashMovement = {
  id: number;
  type: MovementType;
  amount: number;
  description: string | null;
  createdAt: string;
  recordedBy: {
    id: number;
    name: string;
  };
  employee: {
    id: number;
    name: string;
  } | null;
  reversalOfId: number | null;
  reversedBy: {
    id: number;
    createdAt: string;
  } | null;
};

type HistoryResponse = {
  initialized: boolean;
  movements: CashMovement[];
};

const movementLabels: Record<MovementType, string> = {
  OWNER_WITHDRAWAL: "Retiro del propietario",
  BANK_DEPOSIT: "Consignación bancaria",
  CASH_EXPENSE: "Gasto en efectivo",
  TECHNICIAN_LOAN: "Préstamo a técnica",
  CASH_ADJUSTMENT_IN: "Ajuste de entrada",
  CASH_ADJUSTMENT_OUT: "Ajuste de salida",
  REVERSAL: "Reversión",
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

export default function CashMovementHistory() {
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      try {
        const response = await fetch("/api/cashbox/movements", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("No se pudo consultar el historial de caja.");
        }

        const data: HistoryResponse = await response.json();

        if (
          typeof data.initialized !== "boolean" ||
          !Array.isArray(data.movements)
        ) {
          throw new Error("La respuesta del historial no es válida.");
        }

        if (controller.signal.aborted) {
          return;
        }

        setInitialized(data.initialized);
        setMovements(data.movements);
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : "Ocurrió un error al consultar el historial.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadHistory();

    return () => controller.abort();
  }, []);

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-black">
          Historial de movimientos
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Consulta los últimos 50 movimientos registrados en caja.
        </p>
      </div>

      {isLoading ? (
        <p className="mt-5 text-sm text-neutral-600">
          Consultando movimientos...
        </p>
      ) : error ? (
        <p role="alert" className="mt-5 text-sm text-red-700">
          {error}
        </p>
      ) : !initialized ? (
        <p className="mt-5 text-sm text-neutral-600">
          La caja todavía no está activada.
        </p>
      ) : movements.length === 0 ? (
        <p className="mt-5 text-sm text-neutral-600">
          Todavía no hay movimientos registrados.
        </p>
      ) : (
        <>
          {/* Compact layout for mobile and tablet screens */}
          <div className="mt-5 space-y-3 lg:hidden">
            {movements.map((movement) => (
              <article
                key={movement.id}
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-black">
                      {movementLabels[movement.type] ?? movement.type}
                    </p>

                    <p className="mt-1 text-xs text-neutral-500">
                      {formatDate(movement.createdAt)}
                    </p>
                  </div>

                  <p
                    className={`shrink-0 text-right text-base font-bold ${
                      movement.amount < 0 ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    {movement.amount > 0 ? "+" : ""}
                    {formatCOP(movement.amount)}
                  </p>
                </div>

                <p className="mt-3 break-words text-sm text-neutral-700">
                  {movement.description || "Sin descripción"}
                </p>

                {movement.employee && (
                  <p className="mt-2 text-sm text-neutral-600">
                    Técnica: {movement.employee.name}
                  </p>
                )}

                <p className="mt-3 text-xs text-neutral-500">
                  Registrado por: {movement.recordedBy.name}
                </p>

                {movement.reversedBy && (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Movimiento revertido
                  </p>
                )}

                {movement.reversalOfId !== null && (
                  <p className="mt-2 text-xs text-neutral-500">
                    Revierte movimiento #{movement.reversalOfId}
                  </p>
                )}
              </article>
            ))}
          </div>

          {/* Full table for larger desktop screens */}
          <div className="mt-5 hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-neutral-200 text-neutral-500">
                <tr>
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Movimiento</th>
                  <th className="px-3 py-3 font-medium">Detalle</th>
                  <th className="px-3 py-3 font-medium">Registrado por</th>
                  <th className="px-3 py-3 text-right font-medium">Valor</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-neutral-100">
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td className="whitespace-nowrap px-3 py-4 text-neutral-600">
                      {formatDate(movement.createdAt)}
                    </td>

                    <td className="px-3 py-4">
                      <p className="font-medium text-black">
                        {movementLabels[movement.type] ?? movement.type}
                      </p>

                      {movement.reversedBy && (
                        <p className="mt-1 text-xs text-amber-700">
                          Movimiento revertido
                        </p>
                      )}

                      {movement.reversalOfId !== null && (
                        <p className="mt-1 text-xs text-neutral-500">
                          Revierte movimiento #{movement.reversalOfId}
                        </p>
                      )}
                    </td>

                    <td className="px-3 py-4 text-neutral-600">
                      <p>{movement.description || "Sin descripción"}</p>

                      {movement.employee && (
                        <p className="mt-1 text-xs">
                          Técnica: {movement.employee.name}
                        </p>
                      )}
                    </td>

                    <td className="px-3 py-4 text-neutral-600">
                      {movement.recordedBy.name}
                    </td>

                    <td
                      className={`whitespace-nowrap px-3 py-4 text-right font-semibold ${
                        movement.amount < 0 ? "text-red-700" : "text-green-700"
                      }`}
                    >
                      {movement.amount > 0 ? "+" : ""}
                      {formatCOP(movement.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
