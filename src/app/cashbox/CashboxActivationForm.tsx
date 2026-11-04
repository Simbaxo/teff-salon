"use client";

import { useRef, useState } from "react";

type Props = {
  onActivated: () => Promise<void>;
};

const formatCOP = (amount: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);

export default function CashboxActivationForm({ onActivated }: Props) {
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submittingRef = useRef(false);
  const activationSucceededRef = useRef(false);

  const parsedAmount = Number(amount);

  const validAmount =
    amount.trim() !== "" &&
    Number.isSafeInteger(parsedAmount) &&
    parsedAmount >= 0 &&
    parsedAmount <= 2147483647;

  async function activate() {
    if (
      !validAmount ||
      submittingRef.current ||
      activationSucceededRef.current
    ) {
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setError("");

    try {
      // Recheck initialization before submitting.
      const check = await fetch("/api/cashbox", {
        cache: "no-store",
        credentials: "same-origin",
      });

      if (!check.ok) {
        throw new Error("No se pudo verificar el estado de caja.");
      }

      const current = await check.json();

      if (current.initialized !== false) {
        throw new Error("La caja ya está activada o requiere revisión.");
      }

      const response = await fetch("/api/cashbox", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openingBalance: parsedAmount }),
      });

      const result = await response.json();

      if (!response.ok || result.success !== true) {
        throw new Error(result.error ?? "No se pudo activar la caja.");
      }

      activationSucceededRef.current = true;
      await onActivated();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Error al activar la caja.",
      );
      if (!activationSucceededRef.current) {
        setConfirming(false);
      }
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <label className="block text-sm font-semibold text-black">
        Saldo inicial contado (COP)
        <input
          type="number"
          min="0"
          max="2147483647"
          step="1"
          required
          value={amount}
          disabled={saving || confirming}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Ej. 172950"
          className="mt-2 block w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-base text-black"
        />
      </label>

      {validAmount && (
        <p className="text-sm font-semibold text-emerald-700">
          {formatCOP(parsedAmount)}
        </p>
      )}

      {!confirming ? (
        <button
          type="button"
          disabled={!validAmount || saving}
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-black px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          Continuar
        </button>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="font-semibold text-black">Confirmar activación</p>

          <p className="mt-2 text-sm text-neutral-700">
            Vas a activar la caja con un saldo inicial de{" "}
            <strong>{formatCOP(parsedAmount)}</strong>.
          </p>

          <p className="mt-2 text-sm text-amber-900">
            Verifica que este valor coincida con el efectivo contado
            físicamente.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void activate()}
              className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Activando..." : "Confirmar y activar caja"}
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-neutral-300 bg-white px-5 py-3 text-black"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
