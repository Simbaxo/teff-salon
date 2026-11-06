"use client";

import { useCallback, useEffect, useState } from "react";
import CopAmountHint from "@/components/CopAmountHint";

type Category = {
  id: number;
  name: string;
  active: boolean;
};

type RecurringExpense = {
  id: number;
  name: string;
  amount: number;
  dayOfMonth: number;
  active: boolean;
  category: { id: number; name: string };
};

type Props = {
  onFinancialChange: () => void;
};

const formatCOP = (amount: number) => `$${amount.toLocaleString("es-CO")}`;

function getCurrentMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default function RecurringExpenseManager({ onFinancialChange }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<RecurringExpense[]>([]);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("4");
  const [month, setMonth] = useState(getCurrentMonth);
  const [startMonth, setStartMonth] = useState(getCurrentMonth);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadTemplates = useCallback(async () => {
    const response = await fetch("/api/admin/expenses/recurring", {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("No se pudieron cargar los gastos recurrentes.");
    }

    const result: { recurringExpenses: RecurringExpense[] } =
      await response.json();

    setTemplates(result.recurringExpenses);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInitialData() {
      try {
        const [categoryResponse, templateResponse] = await Promise.all([
          fetch("/api/admin/expenses/categories", {
            signal: controller.signal,
            cache: "no-store",
          }),
          fetch("/api/admin/expenses/recurring", {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);

        if (!categoryResponse.ok || !templateResponse.ok) {
          throw new Error("No se pudieron cargar los datos.");
        }

        const categoryResult: { categories: Category[] } =
          await categoryResponse.json();

        const templateResult: { recurringExpenses: RecurringExpense[] } =
          await templateResponse.json();

        if (controller.signal.aborted) return;

        setCategories(categoryResult.categories);
        setTemplates(templateResult.recurringExpenses);
      } catch {
        if (!controller.signal.aborted) {
          setError("No se pudieron cargar los gastos recurrentes.");
        }
      }
    }

    void loadInitialData();

    return () => controller.abort();
  }, []);

  async function createTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/expenses/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId: Number(categoryId),
          amount: Number(amount),
          dayOfMonth: Number(dayOfMonth),
          startMonth,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ?? "No se pudo crear el gasto recurrente.",
        );
      }

      await loadTemplates();

      setName("");
      setAmount("");
      setSuccess("Gasto recurrente creado correctamente.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear el gasto recurrente.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function generateMonth() {
    if (generating) return;

    setGenerating(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/expenses/recurring/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });

      const result: {
        success?: boolean;
        created?: number;
        existing?: number;
        error?: string;
      } = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(result.error ?? "No se pudieron generar los gastos.");
      }

      setSuccess(
        `${result.created ?? 0} gastos generados. ${result.existing ?? 0} ya existían.`,
      );

      onFinancialChange();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron generar los gastos.",
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="mt-6 space-y-5">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">Gastos recurrentes</h2>

        <p className="mt-1 text-sm text-neutral-600">
          Configura gastos mensuales como arriendo, servicios públicos y
          suscripciones.
        </p>

        <form
          onSubmit={createTemplate}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <label className="text-sm font-medium text-black">
            Nombre
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              className="mt-2 w-full rounded-lg border p-3"
            />
          </label>

          <label className="text-sm font-medium text-black">
            Categoría
            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="mt-2 w-full rounded-lg border p-3"
            >
              <option value="">Seleccionar categoría</option>
              {categories
                .filter((item) => item.active)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="block min-w-0 text-sm font-medium text-black">
            Monto mensual (COP)
            <input
              required
              type="number"
              min="1"
              max="2147483647"
              step="1"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Ej. 5300000"
              className="mt-2 block w-full min-w-0 rounded-lg border border-neutral-300 bg-white p-3 text-base text-black"
            />
            <CopAmountHint value={amount} />
          </label>

          <label className="text-sm font-medium text-black">
            Día del mes
            <input
              required
              type="number"
              min="1"
              max="31"
              value={dayOfMonth}
              onChange={(event) => setDayOfMonth(event.target.value)}
              className="mt-2 w-full rounded-lg border p-3"
            />
          </label>

          <button
            type="submit"
            disabled={saving || !categoryId}
            className="rounded-lg bg-[#B76E79] px-5 py-3 font-semibold text-white disabled:opacity-50 sm:col-span-2"
          >
            {saving ? "Guardando..." : "Crear gasto recurrente"}
          </button>

          <label className="text-sm font-medium text-black">
            Mes de inicio
            <input
              required
              type="month"
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value)}
              className="mt-2 block w-full min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base font-medium text-black [color-scheme:light]"
            />
          </label>
        </form>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-black">Generar gastos del mes</h2>

        <p className="mt-1 text-sm text-neutral-600">
          Los gastos generados quedarán pendientes de aprobación.
        </p>

        <input
          type="month"
          aria-label="Mes para generar gastos"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="mt-2 block w-full min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base font-medium text-black [color-scheme:light]"
        />

        <button
          type="button"
          disabled={
            generating || templates.filter((item) => item.active).length === 0
          }
          onClick={() => void generateMonth()}
          className="mt-4 block rounded-lg bg-black px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {generating ? "Generando..." : "Generar gastos del mes"}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="mt-3 text-sm text-green-700">
            {success}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-black">
          Gastos recurrentes configurados
        </h2>

        {templates.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            Todavía no hay gastos recurrentes configurados.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="rounded-lg border border-neutral-200 p-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-semibold text-black">{template.name}</p>
                    <p className="text-sm text-neutral-600">
                      {template.category.name} · Día {template.dayOfMonth}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-black">
                      {formatCOP(template.amount)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {template.active ? "Activo" : "Inactivo"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
