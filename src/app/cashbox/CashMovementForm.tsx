"use client";

import { useEffect, useRef, useState } from "react";

type MovementType = "OWNER_WITHDRAWAL" | "BANK_DEPOSIT" | "CASH_EXPENSE";

type PendingMovement = {
  type: MovementType;
  amount: number;
  description: string;
  idempotencyKey: string;
};

const PENDING_MOVEMENT_STORAGE_KEY = "teff-cashbox-pending-movement-v1";

function isPendingMovement(value: unknown): value is PendingMovement {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    (data.type === "OWNER_WITHDRAWAL" ||
      data.type === "BANK_DEPOSIT" ||
      data.type === "CASH_EXPENSE") &&
    typeof data.amount === "number" &&
    Number.isSafeInteger(data.amount) &&
    data.amount > 0 &&
    data.amount <= 2147483647 &&
    typeof data.description === "string" &&
    data.description.length > 0 &&
    data.description.length <= 300 &&
    data.description.trim() === data.description &&
    typeof data.idempotencyKey === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      data.idempotencyKey,
    )
  );
}

function readPendingMovement(): PendingMovement | null {
  const stored = sessionStorage.getItem(PENDING_MOVEMENT_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);

    if (!isPendingMovement(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function savePendingMovement(movement: PendingMovement): void {
  sessionStorage.setItem(
    PENDING_MOVEMENT_STORAGE_KEY,
    JSON.stringify(movement),
  );
}

function clearPendingMovement(): void {
  sessionStorage.removeItem(PENDING_MOVEMENT_STORAGE_KEY);
}

const movementOptions: {
  value: MovementType;
  label: string;
}[] = [
  {
    value: "OWNER_WITHDRAWAL",
    label: "Retiro del propietario",
  },
  {
    value: "BANK_DEPOSIT",
    label: "Consignación bancaria",
  },
  {
    value: "CASH_EXPENSE",
    label: "Gasto en efectivo",
  },
];

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

type CashMovementFormProps = {
  onMovementRecorded: () => Promise<void>;
};

export default function CashMovementForm({
  onMovementRecorded,
}: CashMovementFormProps) {
  const [type, setType] = useState<MovementType>("CASH_EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [hasPendingTransaction, setHasPendingTransaction] = useState(false);
  const pendingMovementRef = useRef<PendingMovement | null>(null);
  const submissionLockRef = useRef(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [hasValidPendingRequest, setHasValidPendingRequest] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restorePendingMovement() {
      let recovered: PendingMovement | null = null;
      let recoveryError = "";

      try {
        const stored = sessionStorage.getItem(PENDING_MOVEMENT_STORAGE_KEY);

        if (stored !== null) {
          recovered = readPendingMovement();

          if (!recovered) {
            recoveryError =
              "Hay una referencia de caja guardada que no se pudo validar. Solicita revisión antes de registrar otro movimiento.";
          }
        }
      } catch {
        recoveryError =
          "No se pudo verificar si existen operaciones pendientes. No registres movimientos hasta revisar el almacenamiento del navegador.";
      }

      if (cancelled) {
        return;
      }

      if (recovered) {
        pendingMovementRef.current = recovered;
        setHasValidPendingRequest(true);

        setType(recovered.type);
        setAmount(String(recovered.amount));
        setDescription(recovered.description);
        setShowConfirmation(true);
        setHasPendingTransaction(true);
        setError(
          "Se recuperó una operación pendiente. Verifica su resultado antes de reintentar.",
        );
      } else if (recoveryError) {
        setHasPendingTransaction(true);
        setError(recoveryError);
      }

      setRecoveryChecked(true);
    }

    void Promise.resolve().then(restorePendingMovement);

    return () => {
      cancelled = true;
    };
  }, []);

  const parsedAmount = Number(amount);
  const validAmount =
    amount.trim() !== "" &&
    Number.isSafeInteger(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= 2147483647;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!validAmount) {
      setError("Ingresa un valor válido en pesos colombianos.");
      return;
    }

    if (!description.trim() || description.trim().length > 300) {
      setError("Ingresa una descripción de máximo 300 caracteres.");
      return;
    }

    setShowConfirmation(true);
  }
  async function submitMovement() {
    if (submissionLockRef.current || isSaving) {
      return;
    }

    if (!showConfirmation || !validAmount) {
      setError("Valida el movimiento antes de registrarlo.");
      return;
    }

    const trimmedDescription = description.trim();

    if (!trimmedDescription || trimmedDescription.length > 300) {
      setError("La descripción del movimiento no es válida.");
      return;
    }

    const currentRequest = {
      type,
      amount: parsedAmount,
      description: trimmedDescription,
    };

    const pending = pendingMovementRef.current;

    if (
      pending &&
      (pending.type !== currentRequest.type ||
        pending.amount !== currentRequest.amount ||
        pending.description !== currentRequest.description)
    ) {
      setError(
        "Hay una operación pendiente. No cambies sus datos hasta verificar el resultado.",
      );
      return;
    }

    const request = pending ?? {
      ...currentRequest,
      idempotencyKey: crypto.randomUUID(),
    };

    // Preserve the exact transaction before sending it.
    // Never overwrite a different unresolved request.
    try {
      const stored = sessionStorage.getItem(PENDING_MOVEMENT_STORAGE_KEY);

      if (stored !== null) {
        const recovered = readPendingMovement();

        if (
          !recovered ||
          recovered.idempotencyKey !== request.idempotencyKey ||
          recovered.type !== request.type ||
          recovered.amount !== request.amount ||
          recovered.description !== request.description
        ) {
          setError(
            "Existe una operación pendiente que requiere revisión. No se enviaron nuevos movimientos.",
          );
          return;
        }
      }

      savePendingMovement(request);
    } catch {
      setError(
        "No se pudo guardar la referencia de seguridad. El movimiento no fue enviado.",
      );
      return;
    }

    pendingMovementRef.current = request;
    setHasPendingTransaction(true);
    setHasValidPendingRequest(true);
    submissionLockRef.current = true;

    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/cashbox/movements", {
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
        movement?: { id: number };
        error?: string;
      } = await response.json();

      if (!response.ok || result.success !== true) {
        // Only explicitly recognized business rejections are definitive.
        // Concurrency conflicts, unknown responses, and server failures
        // retain the original transaction reference for safe recovery.
        const definitiveErrors = new Set([
          "Datos del movimiento inválidos.",
          "Usuario no autorizado.",
          "El saldo disponible es insuficiente.",
          "La caja todavía no está activada.",
        ]);

        const confirmedRejection =
          [400, 403, 409].includes(response.status) &&
          typeof result.error === "string" &&
          definitiveErrors.has(result.error);

        if (confirmedRejection) {
          try {
            clearPendingMovement();
            pendingMovementRef.current = null;
            setHasPendingTransaction(false);
            setHasValidPendingRequest(false);
          } catch {
            throw new Error(
              "La operación fue rechazada, pero no se pudo liberar su referencia. Recarga la página únicamente después de verificar el historial de caja.",
            );
          }
        }

        throw new Error(
          result.error ??
            "No se pudo confirmar el movimiento. Reintenta con la misma referencia.",
        );
      }

      if (!Number.isSafeInteger(result.movement?.id)) {
        throw new Error(
          "No se pudo confirmar el número del movimiento. Reintenta con la misma referencia.",
        );
      }

      try {
        clearPendingMovement();
      } catch {
        setError(
          "El movimiento fue registrado, pero no se pudo limpiar su referencia de seguridad. Verifica el historial antes de registrar otro.",
        );
        return;
      }

      pendingMovementRef.current = null;
      setHasPendingTransaction(false);
      setHasValidPendingRequest(false);

      setSuccess(
        result.duplicate
          ? "Este movimiento ya estaba registrado."
          : "Movimiento registrado correctamente.",
      );

      setShowConfirmation(false);
      setAmount("");
      setDescription("");

      void onMovementRecorded();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo confirmar el movimiento. Reintenta con la misma referencia.",
      );
    } finally {
      submissionLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-black">
          Registrar movimiento
        </h2>

        <p className="mt-2 text-sm text-neutral-600">
          Registra las salidas de efectivo y conserva un historial de cada
          operación.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <fieldset disabled={!recoveryChecked}>
          <div>
            <label
              htmlFor="cash-movement-type"
              className="mb-2 block text-sm font-medium text-black"
            >
              Tipo de movimiento
            </label>

            <select
              id="cash-movement-type"
              value={type}
              disabled={isSaving || hasPendingTransaction}
              onChange={(event) => {
                setType(event.target.value as MovementType);
                setShowConfirmation(false);
                setError("");
                setSuccess("");
                pendingMovementRef.current = null;
              }}
              className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-black"
            >
              {movementOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="cash-movement-amount"
              className="mb-2 block text-sm font-medium text-black"
            >
              Valor en pesos
            </label>

            <input
              id="cash-movement-amount"
              type="number"
              min="1"
              max="2147483647"
              step="1"
              value={amount}
              disabled={isSaving || hasPendingTransaction}
              onChange={(event) => {
                setAmount(event.target.value);
                setShowConfirmation(false);
                setError("");
                setSuccess("");
                pendingMovementRef.current = null;
              }}
              placeholder="Ej. 50000"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
              required
            />

            {validAmount && (
              <p className="mt-2 text-sm text-neutral-500">
                {formatCOP(parsedAmount)}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="cash-movement-description"
              className="mb-2 block text-sm font-medium text-black"
            >
              Descripción
            </label>

            <textarea
              id="cash-movement-description"
              value={description}
              disabled={isSaving || hasPendingTransaction}
              onChange={(event) => {
                setDescription(event.target.value);
                setShowConfirmation(false);
                setError("");
                setSuccess("");
                pendingMovementRef.current = null;
              }}
              maxLength={300}
              rows={3}
              placeholder="Describe el motivo del movimiento"
              className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
              required
            />

            <p className="mt-1 text-right text-xs text-neutral-500">
              {description.length}/300
            </p>
          </div>

          {error && (
            <p role="status" className="text-sm text-amber-700">
              {error}
            </p>
          )}

          {success && (
            <p
              role="status"
              className="rounded-lg bg-green-50 p-3 text-sm font-medium text-green-800"
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving || hasPendingTransaction}
            className="rounded-lg bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
          >
            Validar movimiento
          </button>
        </fieldset>
      </form>
      {showConfirmation && (
        <div className="mt-6 rounded-xl border border-[#B76E79] bg-rose-50 p-5">
          <h3 className="text-lg font-semibold text-black">
            Confirmar movimiento
          </h3>

          <p className="mt-2 text-sm text-neutral-600">
            Revisa los datos antes de registrar esta salida de efectivo.
          </p>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">Tipo</dt>
              <dd className="text-right font-medium text-black">
                {movementOptions.find((option) => option.value === type)?.label}
              </dd>
            </div>

            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">Valor</dt>
              <dd className="font-semibold text-black">
                {formatCOP(parsedAmount)}
              </dd>
            </div>

            <div className="flex justify-between gap-3">
              <dt className="text-neutral-600">Descripción</dt>
              <dd className="max-w-xs text-right break-words text-black">
                {description.trim()}
              </dd>
            </div>
          </dl>

          {hasPendingTransaction && !isSaving && error && (
            <p
              role="alert"
              className="mt-4 rounded-lg bg-amber-100 p-3 text-sm text-amber-900"
            >
              No pudimos confirmar el resultado de esta operación. No registres
              otro movimiento por el mismo concepto. La referencia original se
              conservará para un reintento seguro.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={isSaving || hasPendingTransaction}
              onClick={() => setShowConfirmation(false)}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Volver a editar
            </button>

            <button
              type="button"
              disabled={isSaving || hasPendingTransaction || !recoveryChecked}
              onClick={() => void submitMovement()}
              className="rounded-lg bg-[#B76E79] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Registrando..." : "Confirmar y registrar"}
            </button>

            {hasPendingTransaction && !isSaving && (
              <button
                type="button"
                disabled={
                  !recoveryChecked ||
                  isSaving ||
                  !hasPendingTransaction ||
                  !hasValidPendingRequest
                }
                onClick={() => void submitMovement()}
                className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Reintentar operación pendiente
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
