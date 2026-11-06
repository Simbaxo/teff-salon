"use client";

import { useEffect, useState } from "react";

type ProfitLoss = {
  month: string;
  salesCount: number;
  confirmed: {
    revenue: number;
    laborCosts: number;
    operatingExpenses: number;
    totalExpenses: number;
    estimatedProfit: number;
    profitMargin: number;
  };
  projected: {
    estimatedProfit: number;
  };
  breakdown: {
    technicianCommissions: number;
    confirmedSalaries: number;
    provisionalSalaries: number;
    confirmedBonuses: number;
    provisionalBonuses: number;
    approvedExpenses: number;
  };
  payrollCompleteness: {
    missingWeeks: string[];
    unreviewedWeeks: string[];
    complete: boolean;
  };
  warnings: string[];
};

const formatCOP = (amount: number) => `$${amount.toLocaleString("es-CO")}`;

function currentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default function ExpensesDashboard({
  refreshKey,
}: {
  refreshKey: number;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<ProfitLoss | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);

      try {
        const response = await fetch(
          `/api/admin/expenses/profit-loss?month=${month}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("No se pudo cargar el estado de resultados.");
        }

        const result: ProfitLoss = await response.json();

        if (!controller.signal.aborted) {
          setData(result);
          setError("");
        }
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "Error al consultar las finanzas.",
        );
        setData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [month, refreshKey]);

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <label
          htmlFor="financial-month"
          className="block text-sm font-semibold text-black"
        >
          Mes del reporte
        </label>

        <input
          id="financial-month"
          type="month"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="mt-2 block w-full min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base font-medium text-black [color-scheme:light] sm:max-w-xs"
        />
      </div>

      {loading && (
        <p className="text-sm text-neutral-600">
          Cargando información financiera...
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">
          {error}
        </p>
      )}

      {!loading && data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Ventas netas", data.confirmed.revenue],
              ["Gastos totales", data.confirmed.totalExpenses],
              ["Utilidad estimada", data.confirmed.estimatedProfit],
              ["Comisiones técnicas", data.breakdown.technicianCommissions],
            ].map(([label, amount]) => (
              <div key={label} className="rounded-xl bg-white p-5 shadow-sm">
                <p className="text-sm text-neutral-500">{label}</p>
                <p className="mt-2 text-2xl font-bold text-black">
                  {formatCOP(Number(amount))}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-black">Resumen financiero</h2>

            <dl className="mt-4 space-y-3 text-sm">
              {[
                ["Ventas netas", data.confirmed.revenue],
                ["Comisiones técnicas", data.breakdown.technicianCommissions],
                ["Salarios confirmados", data.breakdown.confirmedSalaries],
                ["Bonos confirmados", data.breakdown.confirmedBonuses],
                ["Gastos aprobados", data.breakdown.approvedExpenses],
                ["Total gastos", data.confirmed.totalExpenses],
                ["Utilidad estimada", data.confirmed.estimatedProfit],
              ].map(([label, amount]) => (
                <div
                  key={label}
                  className="flex justify-between gap-4 border-b border-neutral-100 pb-2"
                >
                  <dt className="text-neutral-600">{label}</dt>
                  <dd className="font-semibold text-black">
                    {formatCOP(Number(amount))}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-sm text-neutral-600">
              Margen estimado:{" "}
              <strong>{data.confirmed.profitMargin.toFixed(2)}%</strong>
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-black">
              Conciliación de gastos y caja
            </h2>

            <p className="mt-2 text-sm text-neutral-600">
              Los gastos registrados en Finanzas y los movimientos de Caja de
              Efectivo se administran por separado.
            </p>

            <p className="mt-2 text-sm text-neutral-600">
              Si un gasto se pagó con efectivo de la caja, verifica que exista
              una sola entrada de gasto en Finanzas y que la salida de efectivo
              esté registrada en Caja.
            </p>

            <p className="mt-3 text-sm font-medium text-amber-800">
              La utilidad es estimada. La conciliación automática entre Caja y
              Finanzas estará disponible próximamente.
            </p>
          </div>

          {(data.breakdown.provisionalSalaries > 0 ||
            data.breakdown.provisionalBonuses > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-semibold text-amber-900">
                Nómina provisional
              </h2>

              <p className="mt-2 text-sm text-amber-800">
                Salarios pendientes de revisión:{" "}
                {formatCOP(data.breakdown.provisionalSalaries)}
              </p>

              <p className="mt-2 text-sm text-amber-800">
                Bonos pendientes de revisión:{" "}
                {formatCOP(data.breakdown.provisionalBonuses)}
              </p>

              <p className="mt-2 text-sm text-amber-800">
                Utilidad proyectada: {formatCOP(data.projected.estimatedProfit)}
              </p>
            </div>
          )}

          {!data.payrollCompleteness.complete && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-lg font-bold text-amber-900">
                Nómina pendiente de verificar
              </h2>

              <p className="mt-2 text-sm text-amber-800">
                Algunas semanas todavía no tienen una nómina preparada o
                revisada. La utilidad estimada puede cambiar.
              </p>

              {data.payrollCompleteness.missingWeeks.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-amber-900">
                    Semanas sin nómina preparada
                  </p>

                  <ul className="mt-2 list-inside list-disc text-sm text-amber-800">
                    {data.payrollCompleteness.missingWeeks.map((week) => (
                      <li key={week}>Semana del {week}</li>
                    ))}
                  </ul>
                </div>
              )}

              {data.payrollCompleteness.unreviewedWeeks.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-amber-900">
                    Semanas pendientes de revisión
                  </p>

                  <ul className="mt-2 list-inside list-disc text-sm text-amber-800">
                    {data.payrollCompleteness.unreviewedWeeks.map((week) => (
                      <li key={week}>Semana del {week}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {data.warnings.map((warning) => (
            <p key={warning} className="text-sm text-amber-700">
              {warning}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
