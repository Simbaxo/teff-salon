"use client";

import { useEffect, useRef, useState } from "react";

type Technician = {
  id: number;
  name: string;
};

type TechnicianResponse = {
  technicians: Technician[];
};

type PendingLoan = {
  employeeId: number;
  amount: number;
  description: string;
  idempotencyKey: string;
};

const PENDING_LOAN_STORAGE_KEY = "teff-cashbox-pending-loan-v1";

function isPendingLoan(value: unknown): value is PendingLoan {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    typeof data.employeeId === "number" &&
    Number.isSafeInteger(data.employeeId) &&
    data.employeeId > 0 &&
    typeof data.amount === "number" &&
    Number.isSafeInteger(data.amount) &&
    data.amount > 0 &&
    data.amount <= 2147483647 &&
    typeof data.description === "string" &&
    data.description.length <= 300 &&
    data.description.trim() === data.description &&
    typeof data.idempotencyKey === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      data.idempotencyKey,
    )
  );
}

function readPendingLoan(): PendingLoan | null {
  const stored = sessionStorage.getItem(PENDING_LOAN_STORAGE_KEY);

  if (stored === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(stored);

    return isPendingLoan(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function savePendingLoan(loan: PendingLoan): void {
  if (!isPendingLoan(loan)) {
    throw new Error("INVALID_PENDING_LOAN");
  }

  sessionStorage.setItem(PENDING_LOAN_STORAGE_KEY, JSON.stringify(loan));
}

function clearPendingLoan(): void {
  sessionStorage.removeItem(PENDING_LOAN_STORAGE_KEY);
}

function persistLoanBeforeSubmission(loan: PendingLoan): void {
  const stored = sessionStorage.getItem(PENDING_LOAN_STORAGE_KEY);

  if (stored !== null) {
    const existing = readPendingLoan();

    if (
      !existing ||
      existing.idempotencyKey !== loan.idempotencyKey ||
      existing.employeeId !== loan.employeeId ||
      existing.amount !== loan.amount ||
      existing.description !== loan.description
    ) {
      throw new Error(
        "Existe un préstamo pendiente que requiere revisión. No se enviaron nuevos préstamos.",
      );
    }
  }

  savePendingLoan(loan);
}

function formatCOP(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

type TechnicianLoanFormProps = {
  onLoanRecorded: () => Promise<void>;
};

export default function TechnicianLoanForm({
  onLoanRecorded,
}: TechnicianLoanFormProps) {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState("");
  const [validated, setValidated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasPendingLoan, setHasPendingLoan] = useState(false);
  const [hasValidPendingLoan, setHasValidPendingLoan] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [success, setSuccess] = useState("");

  const pendingLoanRef = useRef<PendingLoan | null>(null);
  const submissionLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function restorePendingLoan() {
      let recovered: PendingLoan | null = null;
      let recoveryError = "";

      try {
        const stored = sessionStorage.getItem(PENDING_LOAN_STORAGE_KEY);

        if (stored !== null) {
          recovered = readPendingLoan();

          if (!recovered) {
            recoveryError =
              "Hay una referencia de préstamo guardada que no se pudo validar. Solicita revisión antes de registrar otro préstamo.";
          }
        }
      } catch {
        recoveryError =
          "No se pudo verificar si existen préstamos pendientes. No registres préstamos hasta revisar el almacenamiento del navegador.";
      }

      if (cancelled) {
        return;
      }

      if (recovered) {
        pendingLoanRef.current = recovered;

        setEmployeeId(String(recovered.employeeId));
        setAmount(String(recovered.amount));
        setDescription(recovered.description);

        setValidated(true);
        setHasPendingLoan(true);
        setHasValidPendingLoan(true);

        setFormError(
          "Se recuperó un préstamo pendiente. Verifica su resultado antes de reintentar.",
        );
      } else if (recoveryError) {
        setHasPendingLoan(true);
        setHasValidPendingLoan(false);
        setFormError(recoveryError);
      }

      setRecoveryChecked(true);
    }

    void Promise.resolve().then(restorePendingLoan);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTechnicians() {
      try {
        const response = await fetch("/api/cashbox/technicians", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("No se pudo cargar la lista de técnicas.");
        }

        const data: TechnicianResponse = await response.json();

        if (
          !Array.isArray(data.technicians) ||
          !data.technicians.every(
            (technician) =>
              Number.isSafeInteger(technician.id) &&
              technician.id > 0 &&
              typeof technician.name === "string",
          )
        ) {
          throw new Error("La lista de técnicas no es válida.");
        }

        if (controller.signal.aborted) return;

        setTechnicians(data.technicians);
      } catch (cause) {
        if (controller.signal.aborted) return;

        setLoadError(
          cause instanceof Error
            ? cause.message
            : "Ocurrió un error al cargar las técnicas.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadTechnicians();

    return () => controller.abort();
  }, []);

  const selectedTechnician = technicians.find(
    (technician) => String(technician.id) === employeeId,
  );

  const recoveredTechnicianMissing =
    hasPendingLoan &&
    hasValidPendingLoan &&
    !selectedTechnician &&
    employeeId !== "";

  const parsedAmount = Number(amount);

  const validAmount =
    amount.trim() !== "" &&
    Number.isSafeInteger(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= 2147483647;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setValidated(false);

    if (!selectedTechnician) {
      setFormError("Selecciona una técnica válida.");
      return;
    }

    if (!validAmount) {
      setFormError("Ingresa un valor válido en pesos colombianos.");
      return;
    }

    if (description.trim().length > 300) {
      setFormError("La descripción no puede superar 300 caracteres.");
      return;
    }

    setValidated(true);
  }

  async function submitLoan() {
    if (submissionLockRef.current || isSaving || !recoveryChecked) {
      return;
    }

    // Never submit while recovery is invalid or incomplete.
    // An unresolved loan must retain its original reference.
    if (hasPendingLoan && !hasValidPendingLoan) {
      setFormError(
        "Existe un préstamo pendiente que requiere revisión. No se enviaron nuevos préstamos.",
      );
      return;
    }

    if (hasPendingLoan && !pendingLoanRef.current) {
      setFormError(
        "No se encontró la referencia original del préstamo. Solicita revisión antes de continuar.",
      );
      return;
    }

    if (!validated || !validAmount) {
      setFormError("Valida el préstamo antes de registrarlo.");
      return;
    }

    const pending = pendingLoanRef.current;

    if (!selectedTechnician && !pending) {
      setFormError(
        "Selecciona una técnica activa antes de registrar un préstamo.",
      );
      return;
    }

    const trimmedDescription = description.trim();

    if (trimmedDescription.length > 300) {
      setFormError("La descripción no puede superar 300 caracteres.");
      return;
    }

    const currentRequest = {
      employeeId: pending?.employeeId ?? selectedTechnician!.id,
      amount: parsedAmount,
      description: trimmedDescription,
    };

    if (hasPendingLoan && (!hasValidPendingLoan || !pending)) {
      setFormError(
        "Hay un préstamo pendiente que requiere revisión. No se envió otro préstamo.",
      );
      return;
    }

    if (
      pending &&
      (pending.employeeId !== currentRequest.employeeId ||
        pending.amount !== currentRequest.amount ||
        pending.description !== currentRequest.description)
    ) {
      setFormError("Los datos no coinciden con el préstamo pendiente.");
      return;
    }

    const request = pending ?? {
      ...currentRequest,
      idempotencyKey: crypto.randomUUID(),
    };

    try {
      persistLoanBeforeSubmission(request);
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "No se pudo conservar la referencia del préstamo.",
      );
      return;
    }

    pendingLoanRef.current = request;
    setHasPendingLoan(true);
    setHasValidPendingLoan(true);
    submissionLockRef.current = true;

    setIsSaving(true);
    setFormError("");
    setSuccess("");

    try {
      const response = await fetch("/api/cashbox/loans", {
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
        movementId?: number;
        week?: string;
        amount?: number;
        error?: string;
        code?: string;
      } = await response.json();

      if (!response.ok || result.success !== true) {
        // Only explicit, known business rejections allow a new request.
        // Unknown failures and concurrency conflicts retain the original UUID.
        const definitiveCodes = new Set([
          "UNAUTHORIZED_USER",
          "INVALID_EMPLOYEE",
          "CASHBOX_NOT_INITIALIZED",
          "INSUFFICIENT_CASH",
          "PAYROLL_LOCKED",
          "PAYROLL_ATTRIBUTION_ERROR",
          "INSUFFICIENT_PAYROLL",
          "INVALID_CASHBOX_BALANCE",
        ]);

        const confirmedRejection =
          [400, 403, 409].includes(response.status) &&
          typeof result.code === "string" &&
          definitiveCodes.has(result.code);

        if (confirmedRejection) {
          try {
            clearPendingLoan();

            pendingLoanRef.current = null;
            setHasPendingLoan(false);
            setHasValidPendingLoan(false);
          } catch {
            throw new Error(
              "El préstamo fue rechazado, pero no se pudo liberar su referencia. Solicita revisión antes de registrar otro préstamo.",
            );
          }
        }

        throw new Error(
          result.error ??
            "No se pudo confirmar el préstamo. Conserva la referencia original.",
        );
      }

      if (
        !Number.isSafeInteger(result.movementId) ||
        result.amount !== request.amount ||
        typeof result.week !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(result.week)
      ) {
        throw new Error(
          "La respuesta del préstamo requiere verificación. Conserva la referencia original.",
        );
      }

      // The server confirmed the movement and payroll deduction.
      // Keep the request locked if browser storage cannot be cleared.
      clearPendingLoan();

      pendingLoanRef.current = null;
      setHasPendingLoan(false);
      setHasValidPendingLoan(false);

      setSuccess(
        result.duplicate
          ? "Este préstamo ya estaba registrado."
          : "Préstamo registrado y descontado de la nómina.",
      );

      setValidated(false);
      setEmployeeId("");
      setAmount("");
      setDescription("");

      void onLoanRecorded();
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "No se pudo confirmar el préstamo. Conserva la referencia original.",
      );
    } finally {
      submissionLockRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-black">Préstamos a técnicas</h2>

      <p className="mt-2 text-sm text-neutral-600">
        Registra préstamos de efectivo que se descuentan de la nómina semanal de
        la técnica.
      </p>

      {isLoading ? (
        <p className="mt-5 text-sm text-neutral-600">Cargando técnicas...</p>
      ) : loadError ? (
        <p role="alert" className="mt-5 text-sm text-red-700">
          {loadError}
        </p>
      ) : technicians.length === 0 ? (
        <p className="mt-5 text-sm text-neutral-600">
          No hay técnicas disponibles para préstamos.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <fieldset disabled={!recoveryChecked || isSaving || hasPendingLoan}>
            <div>
              <label
                htmlFor="loan-employee"
                className="mb-2 block text-sm font-medium text-black"
              >
                Técnica
              </label>

              <select
                id="loan-employee"
                value={employeeId}
                onChange={(event) => {
                  setEmployeeId(event.target.value);
                  setValidated(false);
                  setFormError("");
                }}
                required
                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-black"
              >
                <option value="">Selecciona una técnica</option>

                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="loan-amount"
                className="mb-2 block text-sm font-medium text-black"
              >
                Valor del préstamo
              </label>

              <input
                id="loan-amount"
                type="number"
                min="1"
                max="2147483647"
                step="1"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setValidated(false);
                  setFormError("");
                }}
                placeholder="Ej. 50000"
                required
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
              />

              {validAmount && (
                <p className="mt-2 text-sm text-neutral-500">
                  {formatCOP(parsedAmount)}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="loan-description"
                className="mb-2 block text-sm font-medium text-black"
              >
                Descripción (opcional)
              </label>

              <textarea
                id="loan-description"
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setValidated(false);
                  setFormError("");
                }}
                maxLength={300}
                rows={3}
                placeholder="Motivo del préstamo"
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-black"
              />

              <p className="mt-1 text-right text-xs text-neutral-500">
                {description.length}/300
              </p>
            </div>
          </fieldset>

          {formError && (
            <p role="alert" className="text-sm text-red-700">
              {formError}
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

          {validated && (selectedTechnician || recoveredTechnicianMissing) && (
            <div className="rounded-xl border border-[#B76E79] bg-rose-50 p-5">
              <h3 className="text-lg font-semibold text-black">
                Confirmar préstamo
              </h3>

              <p className="mt-2 text-sm text-neutral-600">
                Revisa los datos antes de registrar el préstamo.
              </p>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-600">Técnica</dt>
                  <dd className="font-medium text-black">
                    {selectedTechnician?.name ??
                      `Técnica #${employeeId} (no disponible en la lista actual)`}
                  </dd>
                </div>

                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-600">Valor del préstamo</dt>
                  <dd className="font-semibold text-black">
                    {formatCOP(parsedAmount)}
                  </dd>
                </div>

                <div className="flex justify-between gap-3">
                  <dt className="text-neutral-600">Descripción</dt>
                  <dd className="max-w-xs text-right break-words text-black">
                    {description.trim() || "Sin descripción"}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900">
                  Descuento automático de nómina
                </p>

                <p className="mt-2 text-sm text-amber-800">
                  El valor completo del préstamo se descontará de la nómina de
                  esta semana. El sistema verificará que exista suficiente
                  efectivo y saldo disponible de nómina antes de permitir el
                  registro.
                </p>
              </div>

              {hasPendingLoan && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
                >
                  {hasValidPendingLoan
                    ? "Este préstamo tiene una referencia pendiente. No registres otro préstamo por el mismo concepto hasta confirmar el resultado."
                    : "No se pudo validar la referencia del préstamo pendiente. Solicita revisión antes de continuar."}
                </div>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isSaving || hasPendingLoan}
                  onClick={() => setValidated(false)}
                  className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Volver a editar
                </button>

                <button
                  type="button"
                  disabled={isSaving || hasPendingLoan || !recoveryChecked}
                  onClick={() => void submitLoan()}
                  className="rounded-lg bg-[#B76E79] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSaving
                    ? "Registrando préstamo..."
                    : "Confirmar y registrar préstamo"}
                </button>

                {hasPendingLoan && hasValidPendingLoan && !isSaving && (
                  <button
                    type="button"
                    disabled={
                      !recoveryChecked ||
                      !hasPendingLoan ||
                      !hasValidPendingLoan ||
                      isSaving
                    }
                    onClick={() => void submitLoan()}
                    className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reintentar préstamo pendiente
                  </button>
                )}
              </div>

              <p className="mt-3 text-xs text-neutral-600">
                Todavía no se ha registrado ningún préstamo.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!recoveryChecked || isSaving || hasPendingLoan}
            className="rounded-lg bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Validar préstamo
          </button>
        </form>
      )}
    </section>
  );
}
