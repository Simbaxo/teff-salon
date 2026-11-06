"use client";

import { useCallback, useEffect, useState } from "react";
import CopAmountHint from "@/components/CopAmountHint";

type Category = {
  id: number;
  name: string;
  active: boolean;
};

type Expense = {
  id: number;
  description: string;
  supplier: string | null;
  amount: number;
  expenseDate: string;
  reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  paymentStatus: "PAID" | "UNPAID";
  category: { id: number; name: string };
};

const formatCOP = (value: number) => `$${value.toLocaleString("es-CO")}`;

function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function ExpenseManager({
  refreshKey,
  onFinancialChange,
}: {
  refreshKey: number;
  onFinancialChange: () => void;
}) {
  const [month, setMonth] = useState(() => getToday().slice(0, 7));
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(getToday);
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "UNPAID">(
    "UNPAID",
  );
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paidDate, setPaidDate] = useState(getToday);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewingExpenseId, setReviewingExpenseId] = useState<number | null>(
    null,
  );
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/admin/expenses?month=${encodeURIComponent(month)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error("No se pudieron cargar los gastos.");
      }

      const result: { expenses: Expense[] } = await response.json();
      setExpenses(result.expenses);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Error al consultar gastos.",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadCategories() {
      try {
        const response = await fetch("/api/admin/expenses/categories", {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) throw new Error("Error al cargar categorías.");

        const result: { categories: Category[] } = await response.json();

        if (!controller.signal.aborted) {
          setCategories(result.categories);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("No se pudieron cargar las categorías.");
        }
      }
    }

    void loadCategories();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      await Promise.resolve();

      if (!controller.signal.aborted) {
        await loadExpenses();
      }
    };

    void load();

    return () => controller.abort();
  }, [loadExpenses, refreshKey]);

  async function reviewExpense(
    expenseId: number,
    action: "APPROVE" | "REJECT" | "REOPEN",
  ) {
    if (reviewingExpenseId !== null) return;

    setReviewingExpenseId(expenseId);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/expenses/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expenseId, action }),
      });

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(
          result.error ?? "No se pudo actualizar la revisión del gasto.",
        );
      }

      await loadExpenses();
      onFinancialChange();

      setSuccess(
        action === "APPROVE"
          ? "Gasto aprobado correctamente."
          : action === "REJECT"
            ? "Gasto rechazado."
            : "Gasto devuelto a revisión.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar el gasto.",
      );
    } finally {
      setReviewingExpenseId(null);
    }
  }

  async function createCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (savingCategory || newCategoryName.trim().length < 2) {
      return;
    }

    setSavingCategory(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/expenses/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newCategoryName.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.category) {
        throw new Error(result.error ?? "No se pudo crear la categoría.");
      }

      setCategories((current) =>
        [...current, result.category].sort((a, b) =>
          a.name.localeCompare(b.name, "es"),
        ),
      );

      setCategoryId(String(result.category.id));
      setNewCategoryName("");
      setSuccess("Categoría creada correctamente.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la categoría.",
      );
    } finally {
      setSavingCategory(false);
    }
  }

  async function submitExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: Number(categoryId),
          description,
          supplier,
          amount: Number(amount),
          expenseDate,
          paymentStatus,
          paymentMethod: paymentStatus === "PAID" ? paymentMethod : null,
          paidDate: paymentStatus === "PAID" ? paidDate : null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo registrar el gasto.");
      }

      setDescription("");
      setSupplier("");
      setAmount("");
      setSuccess("Gasto registrado. Pendiente de aprobación.");
      await loadExpenses();
      onFinancialChange();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo registrar el gasto.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">Categorías de gastos</h2>

        <p className="mt-1 text-sm text-neutral-600">
          Organiza los gastos del salón por categoría.
        </p>

        <form
          onSubmit={createCategory}
          className="mt-4 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="Ej. Arriendo, Insumos, Publicidad"
            maxLength={80}
            required
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-3 text-black"
          />

          <button
            type="submit"
            disabled={savingCategory || newCategoryName.trim().length < 2}
            className="rounded-lg bg-[#B76E79] px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingCategory ? "Guardando..." : "Crear categoría"}
          </button>
        </form>

        {categories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((category) => (
              <span
                key={category.id}
                className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-700"
              >
                {category.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">Registrar gasto</h2>

        <p className="mt-1 text-sm text-neutral-600">
          Los gastos nuevos requieren aprobación antes de aparecer en el estado
          de resultados.
        </p>

        <form
          onSubmit={submitExpense}
          className="mt-5 grid gap-4 sm:grid-cols-2"
        >
          <label className="block text-sm font-medium text-black">
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
            Monto (COP)
            <input
              required
              type="number"
              min="1"
              max="2147483647"
              step="1"
              inputMode="numeric"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Ej. 20000"
              className="mt-2 block w-full min-w-0 rounded-lg border border-neutral-300 bg-white p-3 text-base text-black"
            />
            <CopAmountHint value={amount} />
          </label>

          <label className="block text-sm font-medium text-black sm:col-span-2">
            Descripción
            <input
              required
              maxLength={300}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 w-full rounded-lg border p-3"
            />
          </label>

          <label className="block text-sm font-medium text-black">
            Proveedor (opcional)
            <input
              maxLength={150}
              value={supplier}
              onChange={(event) => setSupplier(event.target.value)}
              className="mt-2 w-full rounded-lg border p-3"
            />
          </label>

          <label className="block text-sm font-medium text-black">
            Fecha del gasto
            <input
              required
              type="date"
              value={expenseDate}
              onChange={(event) => setExpenseDate(event.target.value)}
              className="mt-2 block w-full min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base font-medium text-black [color-scheme:light]"
            />
          </label>

          <label className="block text-sm font-medium text-black">
            Estado de pago
            <select
              value={paymentStatus}
              onChange={(event) =>
                setPaymentStatus(event.target.value as "PAID" | "UNPAID")
              }
              className="mt-2 w-full rounded-lg border p-3"
            >
              <option value="UNPAID">Pendiente de pago</option>
              <option value="PAID">Pagado</option>
            </select>
          </label>

          {paymentStatus === "PAID" && (
            <>
              <label className="block text-sm font-medium text-black">
                Método de pago
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="mt-2 w-full rounded-lg border p-3"
                >
                  <option value="CASH">Efectivo</option>
                  <option value="TRANSFER">Transferencia</option>
                  <option value="BOLD">Bold / Tarjeta</option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-black">
                Fecha de pago
                <input
                  required
                  type="date"
                  value={paidDate}
                  onChange={(event) => setPaidDate(event.target.value)}
                  className="mt-2 block w-full min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base font-medium text-black [color-scheme:light]"
                />
              </label>
            </>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={saving || !categoryId}
              className="rounded-lg bg-[#B76E79] px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Registrar gasto"}
            </button>
          </div>
        </form>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        )}

        {success && (
          <p role="status" className="mt-4 text-sm text-green-700">
            {success}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">Gastos del mes</h2>

        <input
          type="month"
          aria-label="Mes de gastos"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
          className="mt-2 block w-full min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-3 text-base font-medium text-black [color-scheme:light]"
        />

        {loading ? (
          <p className="mt-4 text-sm text-neutral-600">Cargando gastos...</p>
        ) : expenses.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">
            No hay gastos registrados para este mes.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="rounded-lg border border-neutral-200 p-4"
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <div>
                    <p className="font-semibold text-black">
                      {expense.description}
                    </p>
                    <p className="text-sm text-neutral-600">
                      {expense.category.name}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500">
                      {expense.expenseDate.slice(0, 10)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-bold text-black">
                      {formatCOP(expense.amount)}
                    </p>
                    <p className="mt-1 text-xs text-neutral-600">
                      {expense.reviewStatus === "APPROVED"
                        ? "Aprobado"
                        : expense.reviewStatus === "REJECTED"
                          ? "Rechazado"
                          : "Pendiente de revisión"}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {expense.paymentStatus === "PAID"
                        ? "Pagado"
                        : "Sin pagar"}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                    {expense.reviewStatus === "PENDING_REVIEW" ? (
                      <>
                        <button
                          type="button"
                          disabled={reviewingExpenseId !== null}
                          onClick={() =>
                            void reviewExpense(expense.id, "APPROVE")
                          }
                          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Aprobar
                        </button>

                        <button
                          type="button"
                          disabled={reviewingExpenseId !== null}
                          onClick={() =>
                            void reviewExpense(expense.id, "REJECT")
                          }
                          className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                        >
                          Rechazar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={reviewingExpenseId !== null}
                        onClick={() => void reviewExpense(expense.id, "REOPEN")}
                        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
                      >
                        Reabrir revisión
                      </button>
                    )}
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
