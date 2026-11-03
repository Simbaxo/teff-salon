"use client";

import { useCallback, useEffect, useState } from "react";
import CashMovementForm from "./CashMovementForm";
import CashMovementHistory from "./CashMovementHistory";
import TechnicianLoanForm from "./TechnicianLoanForm";
import CashCountForm from "./CashCountForm";
import CashCountHistory from "./CashCountHistory";

type CashboxData =
  | {
      initialized: false;
      readOnly: true;
    }
  | {
      initialized: true;
      readOnly: true;
      cashboxId: number;
      openedAt: string;
      openingBalance: number;
      cashSales: number;
      cashSalesCount: number;
      otherCashIn: number;
      cashOut: number;
      balance: number;
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
    dateStyle: "long",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

export default function CashboxDashboard() {
  const [cashbox, setCashbox] = useState<CashboxData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const loadCashbox = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/cashbox", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("No se pudo consultar la caja de efectivo.");
      }

      const data: CashboxData = await response.json();

      if (typeof data.initialized !== "boolean") {
        throw new Error("La respuesta de caja no es válida.");
      }

      if (data.initialized) {
        const values = [
          data.openingBalance,
          data.cashSales,
          data.cashSalesCount,
          data.otherCashIn,
          data.cashOut,
          data.balance,
        ];

        if (
          values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
          data.openingBalance +
            data.cashSales +
            data.otherCashIn -
            data.cashOut !==
            data.balance
        ) {
          throw new Error("Los valores de caja requieren revisión.");
        }
      }

      setCashbox(data);
    } catch (cause) {
      setCashbox(null);

      setError(
        cause instanceof Error
          ? cause.message
          : "Ocurrió un error al consultar la caja.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleMovementRecorded = useCallback(async () => {
    setHistoryRefreshKey((current) => current + 1);
    await loadCashbox();
  }, [loadCashbox]);

  useEffect(() => {
    const controller = new AbortController();

    async function initializeCashbox() {
      try {
        const response = await fetch("/api/cashbox", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("No se pudo consultar la caja de efectivo.");
        }

        const data: CashboxData = await response.json();

        if (controller.signal.aborted) {
          return;
        }

        if (typeof data.initialized !== "boolean") {
          throw new Error("La respuesta de caja no es válida.");
        }

        if (data.initialized) {
          const values = [
            data.openingBalance,
            data.cashSales,
            data.cashSalesCount,
            data.otherCashIn,
            data.cashOut,
            data.balance,
          ];

          if (
            values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
            data.openingBalance +
              data.cashSales +
              data.otherCashIn -
              data.cashOut !==
              data.balance
          ) {
            throw new Error("Los valores de caja requieren revisión.");
          }
        }

        setCashbox(data);
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }

        setCashbox(null);
        setError(
          cause instanceof Error
            ? cause.message
            : "Ocurrió un error al consultar la caja.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void initializeCashbox();

    return () => {
      controller.abort();
    };
  }, []);

  if (isLoading) {
    return (
      <section
        className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        aria-live="polite"
      >
        <p className="text-neutral-600">Consultando saldo de caja...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section
        className="mt-8 rounded-2xl border border-red-200 bg-white p-6 shadow-sm"
        role="alert"
      >
        <h2 className="text-lg font-semibold text-red-700">
          No se pudo cargar la caja
        </h2>

        <p className="mt-2 text-neutral-700">{error}</p>

        <button
          type="button"
          onClick={() => void loadCashbox()}
          className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Reintentar
        </button>
      </section>
    );
  }

  if (!cashbox) {
    return null;
  }

  if (!cashbox.initialized) {
    return (
      <section className="mt-8 rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-black">
          Caja pendiente de activación
        </h2>

        <p className="mt-3 text-neutral-600">
          La caja de efectivo todavía no está activada. El propietario debe
          registrar el conteo físico inicial antes de comenzar.
        </p>

        <p className="mt-3 text-sm text-amber-800">
          No hay un saldo disponible confirmado.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-neutral-500">
              Saldo disponible en caja
            </p>

            <h2 className="mt-2 text-4xl font-bold tracking-tight text-black">
              {formatCOP(cashbox.balance)}
            </h2>

            <p className="mt-2 text-sm text-neutral-500">
              Saldo acumulado desde la apertura
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadCashbox()}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100"
          >
            Actualizar saldo
          </button>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Saldo inicial",
            value: cashbox.openingBalance,
          },
          {
            label: "Ventas en efectivo",
            value: cashbox.cashSales,
          },
          {
            label: "Otras entradas",
            value: cashbox.otherCashIn,
          },
          {
            label: "Salidas de efectivo",
            value: cashbox.cashOut,
          },
        ].map((item) => (
          <section
            key={item.label}
            className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-neutral-500">{item.label}</p>

            <p className="mt-2 text-2xl font-semibold text-black">
              {formatCOP(item.value)}
            </p>
          </section>
        ))}
      </div>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-black">
          Información de caja
        </h2>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-neutral-600">Fecha de apertura</dt>

            <dd className="font-medium text-black">
              {formatDate(cashbox.openedAt)}
            </dd>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-neutral-600">Pagos recibidos en efectivo</dt>

            <dd className="font-medium text-black">{cashbox.cashSalesCount}</dd>
          </div>
        </dl>
      </section>

      <CashMovementForm onMovementRecorded={handleMovementRecorded} />

      <TechnicianLoanForm onLoanRecorded={handleMovementRecorded} />

      <CashCountForm
        expectedBalance={cashbox.balance}
        onCountRecorded={handleMovementRecorded}
      />

      <CashCountHistory key={historyRefreshKey} />

      <CashMovementHistory key={historyRefreshKey} />
    </div>
  );
}
