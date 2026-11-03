"use client";

import { useEffect, useRef, useState } from "react";

type CashCountFormProps = {
  expectedBalance: number;
  onCountRecorded: () => Promise<void>;
};

type PendingCashCount = {
  countedAmount: number;
  expectedAmount: number;
  notes: string;
  idempotencyKey: string;
};

const PENDING_COUNT_STORAGE_KEY = "teff-cashbox-pending-count-v1";

function isPendingCashCount(value: unknown): value is PendingCashCount {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    typeof data.countedAmount === "number" &&
    Number.isSafeInteger(data.countedAmount) &&
    data.countedAmount >= 0 &&
    data.countedAmount <= 2147483647 &&
    typeof data.expectedAmount === "number" &&
    Number.isSafeInteger(data.expectedAmount) &&
    data.expectedAmount >= 0 &&
    typeof data.notes === "string" &&
    data.notes.length <= 300 &&
    data.notes.trim() === data.notes &&
    typeof data.idempotencyKey === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      data.idempotencyKey,
    )
  );
}

function readPendingCashCount(): PendingCashCount | null {
  const stored = sessionStorage.getItem(PENDING_COUNT_STORAGE_KEY);

  if (stored === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return isPendingCashCount(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function savePendingCashCount(count: PendingCashCount): void {
  if (!isPendingCashCount(count)) {
    throw new Error("INVALID_PENDING_CASH_COUNT");
  }

  sessionStorage.setItem(PENDING_COUNT_STORAGE_KEY, JSON.stringify(count));
}

function clearPendingCashCount(): void {
  sessionStorage.removeItem(PENDING_COUNT_STORAGE_KEY);
}

function persistCashCountBeforeSubmission(count: PendingCashCount): void {
  const stored = sessionStorage.getItem(PENDING_COUNT_STORAGE_KEY);

  if (stored !== null) {
    const existing = readPendingCashCount();

    if (
      !existing ||
      existing.idempotencyKey !== count.idempotencyKey ||
      existing.countedAmount !== count.countedAmount ||
      existing.expectedAmount !== count.expectedAmount ||
      existing.notes !== count.notes
    ) {
      throw new Error(
        "Existe un conteo pendiente que requiere revisión. No se enviaron nuevos conteos.",
      );
    }
  }

  savePendingCashCount(count);
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CashCountForm({
  expectedBalance,
  onCountRecorded,
}: CashCountFormProps) {
  const [countedAmount, setCountedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmedExpectedBalance, setConfirmedExpectedBalance] = useState<
    number | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasPendingCount, setHasPendingCount] = useState(false);
  const [hasValidPendingCount, setHasValidPendingCount] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [success, setSuccess] = useState("");

  const pendingCountRef = useRef<PendingCashCount | null>(null);
  const submissionLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function restorePendingCount() {
      let recovered: PendingCashCount | null = null;
      let recoveryError = "";

      try {
        const stored = sessionStorage.getItem(PENDING_COUNT_STORAGE_KEY);

        if (stored !== null) {
          recovered = readPendingCashCount();

          if (!recovered) {
            recoveryError =
              "Hay una referencia de conteo guardada que no se pudo validar. Solicita revisión antes de registrar otro conteo.";
          }
        }
      } catch {
        recoveryError =
          "No se pudo verificar si existen conteos pendientes. No registres conteos hasta revisar el almacenamiento del navegador.";
      }

      if (cancelled) {
        return;
      }

      if (recovered) {
        pendingCountRef.current = recovered;

        setCountedAmount(String(recovered.countedAmount));
        setNotes(recovered.notes);
        setConfirmedExpectedBalance(recovered.expectedAmount);
        setShowConfirmation(true);
        setHasPendingCount(true);
        setHasValidPendingCount(true);

        setError(
          "Se recuperó un conteo pendiente. Verifica su resultado antes de reintentar.",
        );
      } else if (recoveryError) {
        setHasPendingCount(true);
        setHasValidPendingCount(false);
        setError(recoveryError);
      }

      setRecoveryChecked(true);
    }

    void Promise.resolve().then(restorePendingCount);

    return () => {
      cancelled = true;
    };
  }, []);

  const parsedAmount = Number(countedAmount);

  const validAmount =
    countedAmount.trim() !== "" &&
    Number.isSafeInteger(parsedAmount) &&
    parsedAmount >= 0 &&
    parsedAmount <= 2147483647;

  const validExpectedBalance =
    Number.isSafeInteger(expectedBalance) && expectedBalance >= 0;

  const difference = parsedAmount - expectedBalance;

  const validDifference =
    Number.isSafeInteger(difference) && Math.abs(difference) <= 2147483647;

  const canValidate =
    validAmount &&
    validExpectedBalance &&
    validDifference &&
    notes.trim().length <= 300;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setShowConfirmation(false);

    if (!canValidate) {
      setError("Verifica el valor contado y las observaciones.");
      return;
    }

    if (difference !== 0 && !notes.trim()) {
      setError(
        "Debes explicar la diferencia entre el efectivo contado y el saldo esperado.",
      );
      return;
    }

    setConfirmedExpectedBalance(expectedBalance);
    setShowConfirmation(true);
  }

  async function submitCashCount() {
    if (submissionLockRef.current || isSaving || !recoveryChecked) {
      return;
    }

    if (!showConfirmation || !validAmount) {
      setError("Valida el conteo antes de registrarlo.");
      return;
    }

    const trimmedNotes = notes.trim();

    if (trimmedNotes.length > 300) {
      setError("Las observaciones no pueden superar 300 caracteres.");
      return;
    }

    const pending = pendingCountRef.current;

    if (hasPendingCount && (!hasValidPendingCount || !pending)) {
      setError(
        "Existe un conteo pendiente sin una referencia válida. Solicita revisión.",
      );
      return;
    }

    const requestExpectedBalance =
      pending?.expectedAmount ?? confirmedExpectedBalance;

    if (
      requestExpectedBalance === null ||
      !Number.isSafeInteger(requestExpectedBalance) ||
      requestExpectedBalance < 0
    ) {
      setError("Debes validar nuevamente el saldo esperado.");
      return;
    }

    const requestDifference = parsedAmount - requestExpectedBalance;

    if (
      !Number.isSafeInteger(requestDifference) ||
      Math.abs(requestDifference) > 2147483647
    ) {
      setError("La diferencia del conteo excede el rango permitido.");
      return;
    }

    if (requestDifference !== 0 && !trimmedNotes) {
      setError("Debes explicar la diferencia del conteo.");
      return;
    }

    const currentRequest = {
      countedAmount: parsedAmount,
      expectedAmount: requestExpectedBalance,
      notes: trimmedNotes,
    };

    if (
      pending &&
      (pending.countedAmount !== currentRequest.countedAmount ||
        pending.expectedAmount !== currentRequest.expectedAmount ||
        pending.notes !== currentRequest.notes)
    ) {
      setError("Los datos no coinciden con el conteo pendiente.");
      return;
    }

    const request = pending ?? {
      ...currentRequest,
      idempotencyKey: crypto.randomUUID(),
    };

    try {
      persistCashCountBeforeSubmission(request);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo conservar la referencia del conteo.",
      );
      return;
    }

    pendingCountRef.current = request;
    setHasPendingCount(true);
    setHasValidPendingCount(true);
    submissionLockRef.current = true;
    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/cashbox/counts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(request),
      });

      const result: {
        success?: boolean;
        duplicate?: boolean;
        count?: {
          id: number;
          countedAmount: number;
          expectedAmount: number;
          difference: number;
        };
        error?: string;
        code?: string;
      } = await response.json();

      if (!response.ok || result.success !== true) {
        if (
          response.status === 409 &&
          result.code === "CASHBOX_BALANCE_CHANGED"
        ) {
          // The server explicitly rejected this count.
          // No count was created, so the original reference
          // can be safely released.
          clearPendingCashCount();

          pendingCountRef.current = null;
          setHasPendingCount(false);
          setHasValidPendingCount(false);
          setShowConfirmation(false);
          setConfirmedExpectedBalance(null);

          // Refresh the balance shown by the dashboard.
          void onCountRecorded();

          throw new Error(
            "El saldo de caja cambió. Revisa el saldo actualizado y valida nuevamente el conteo.",
          );
        }

        // Unknown outcomes retain the original UUID.
        throw new Error(
          result.error ??
            "No se pudo confirmar el conteo. Conserva la referencia original.",
        );
      }

      if (
        !Number.isSafeInteger(result.count?.id) ||
        result.count?.countedAmount !== request.countedAmount ||
        result.count?.expectedAmount !== request.expectedAmount ||
        !Number.isSafeInteger(result.count?.difference) ||
        result.count.difference !==
          result.count.countedAmount - result.count.expectedAmount
      ) {
        throw new Error(
          "La respuesta del conteo requiere verificación. Conserva la referencia original.",
        );
      }

      // Clear the stored request only after confirmed success.
      clearPendingCashCount();

      pendingCountRef.current = null;
      setHasPendingCount(false);
      setHasValidPendingCount(false);

      setSuccess(
        result.duplicate
          ? "Este conteo ya estaba registrado."
          : "Conteo físico registrado correctamente.",
      );

      setShowConfirmation(false);
      setCountedAmount("");
      setNotes("");

      void onCountRecorded();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo confirmar el conteo. Reintenta con la misma referencia.",
      );
    } finally {
      submissionLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-black">
        Conteo físico de caja
      </h2>

      <p className="mt-2 text-sm text-neutral-600">
        Compara el efectivo contado con el saldo esperado del sistema. Registrar
        un conteo no modifica automáticamente el saldo de caja.
      </p>

      {recoveryChecked && hasPendingCount && !showConfirmation && (
        <div
          role="alert"
          className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">Conteo pendiente de revisión</p>

          <p className="mt-2">
            {error ||
              "Existe una referencia de conteo pendiente que requiere revisión."}
          </p>

          <p className="mt-2">
            No registres otro conteo hasta verificar la operación. Solicita
            ayuda al propietario si el problema continúa.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <fieldset disabled={!recoveryChecked || isSaving || hasPendingCount}>
          <div className="rounded-xl bg-neutral-50 p-4">
            <p className="text-sm text-neutral-500">Saldo esperado</p>

            <p className="mt-2 text-2xl font-bold text-black">
              {validExpectedBalance
                ? formatCOP(expectedBalance)
                : "No disponible"}
            </p>
          </div>

          <div>
            <label
              htmlFor="cash-count-amount"
              className="mb-2 block text-sm font-medium text-black"
            >
              Efectivo contado
            </label>

            <input
              id="cash-count-amount"
              type="number"
              min="0"
              max="2147483647"
              step="1"
              value={countedAmount}
              onChange={(event) => {
                setCountedAmount(event.target.value);
                setShowConfirmation(false);
                setError("");
              }}
              placeholder="Ej. 499000"
              required
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
            />

            {validAmount && (
              <p className="mt-2 text-sm text-neutral-500">
                {formatCOP(parsedAmount)}
              </p>
            )}
          </div>

          {validAmount && validExpectedBalance && validDifference && (
            <div className="rounded-xl border border-neutral-200 p-4">
              <p className="text-sm text-neutral-500">Diferencia del conteo</p>

              <p
                className={`mt-2 text-2xl font-bold ${
                  difference < 0
                    ? "text-red-700"
                    : difference > 0
                      ? "text-amber-700"
                      : "text-green-700"
                }`}
              >
                {difference > 0 ? "+" : ""}
                {formatCOP(difference)}
              </p>

              <p className="mt-2 text-sm text-neutral-600">
                {difference < 0
                  ? "Faltante de efectivo"
                  : difference > 0
                    ? "Sobrante de efectivo"
                    : "Caja cuadrada"}
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="cash-count-notes"
              className="mb-2 block text-sm font-medium text-black"
            >
              Observaciones
            </label>

            <textarea
              id="cash-count-notes"
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setShowConfirmation(false);
                setError("");
              }}
              maxLength={300}
              rows={3}
              placeholder="Explica cualquier diferencia encontrada"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
            />

            <p className="mt-1 text-right text-xs text-neutral-500">
              {notes.length}/300
            </p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          {success && (
            <p
              role="status"
              className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={!validExpectedBalance}
            className="rounded-lg bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Validar conteo
          </button>
        </fieldset>
      </form>

      {showConfirmation && (
        <div className="mt-6 rounded-xl border border-[#B76E79] bg-rose-50 p-5">
          <h3 className="text-lg font-semibold text-black">
            Confirmar conteo físico
          </h3>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">Saldo esperado</dt>
              <dd className="font-medium text-black">
                {formatCOP(confirmedExpectedBalance ?? expectedBalance)}
              </dd>
            </div>

            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">Efectivo contado</dt>
              <dd className="font-medium text-black">
                {formatCOP(parsedAmount)}
              </dd>
            </div>

            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">Diferencia</dt>
              <dd className="font-semibold text-black">
                {parsedAmount - (confirmedExpectedBalance ?? expectedBalance) >
                0
                  ? "+"
                  : ""}
                {formatCOP(
                  parsedAmount - (confirmedExpectedBalance ?? expectedBalance),
                )}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-sm text-neutral-700">
            Observaciones: {notes.trim() || "Sin observaciones"}
          </p>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          {hasPendingCount && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              Hay un conteo pendiente de confirmación. No registres otro conteo
              hasta verificar el resultado. El sistema conservará la referencia
              original para evitar duplicados.
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isSaving || hasPendingCount}
              onClick={() => setShowConfirmation(false)}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Volver a editar
            </button>

            <button
              type="button"
              disabled={
                !recoveryChecked ||
                isSaving ||
                hasPendingCount ||
                !showConfirmation
              }
              onClick={() => void submitCashCount()}
              className="rounded-lg bg-[#B76E79] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Guardando conteo..." : "Confirmar y guardar conteo"}
            </button>

            {hasPendingCount && !isSaving && (
              <button
                type="button"
                disabled={
                  !recoveryChecked || !hasValidPendingCount || !showConfirmation
                }
                onClick={() => void submitCashCount()}
                className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reintentar conteo pendiente
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
