"use client";

import { useEffect, useState } from "react";
import { getTeffToday } from "@/lib/datetime";

type Employee = {
  id: number;
  name: string;
  active: boolean;
};

type ScheduleBlock = {
  id: number;
  employeeId: number;
  date: string;
  startTime: string;
  endTime: string;
  reason: string | null;
  groupId: string | null;
  employee: {
    id: number;
    name: string;
  };
};

type BlockMode = "hours" | "full-day" | "vacation";

type Props = {
  initialDate: string;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
};

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);

  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default function ScheduleManager({
  initialDate,
  onClose,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<BlockMode>("hours");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);

  const [employeeId, setEmployeeId] = useState(0);
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("09:30");
  const [endTime, setEndTime] = useState("10:30");
  const [reason, setReason] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [employeesResponse, blocksResponse] = await Promise.all([
        fetch("/api/employees"),
        fetch("/api/schedule-blocks"),
      ]);

      if (!employeesResponse.ok || !blocksResponse.ok) {
        throw new Error("No se pudieron cargar los horarios.");
      }

      const employeesData: Employee[] = await employeesResponse.json();
      const blocksData: ScheduleBlock[] = await blocksResponse.json();

      setEmployees(employeesData.filter((employee) => employee.active));
      setBlocks(blocksData);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Error al cargar los horarios.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createBlock() {
    setError("");
    setSuccess("");

    if (employeeId <= 0) {
      setError("Selecciona una técnica.");
      return;
    }

    if (!startDate) {
      setError("Selecciona la fecha de inicio.");
      return;
    }

    if (mode === "vacation" && (!endDate || endDate < startDate)) {
      setError("La fecha final debe ser igual o posterior a la inicial.");
      return;
    }

    if (mode === "hours" && startTime >= endTime) {
      setError("La hora final debe ser posterior a la inicial.");
      return;
    }

    setSaving(true);

    try {
      if (mode === "vacation") {
        const payload = {
          employeeId,
          startDate,
          endDate,
          reason,
        };

        let response = await fetch("/api/schedule-blocks/range", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        let result = await response.json();

        if (
          response.status === 409 &&
          result.conflictType === "EXISTING_APPOINTMENTS"
        ) {
          const confirmed = window.confirm(
            `La técnica tiene ${result.count} cita(s) durante estas fechas.\n\n` +
              "Las citas existentes NO serán canceladas ni reasignadas.\n\n" +
              "¿Deseas bloquear las fechas de todas formas?",
          );

          if (!confirmed) return;

          response = await fetch("/api/schedule-blocks/range", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...payload,
              confirmExistingAppointments: true,
            }),
          });

          result = await response.json();
        }

        if (!response.ok) {
          throw new Error(result.error || "No se pudo guardar la vacación.");
        }

        setSuccess(
          `${result.daysBlocked} días bloqueados para ${result.employeeName}.`,
        );
      } else {
        const response = await fetch("/api/schedule-blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId,
            date: startDate,
            startTime: mode === "full-day" ? "00:00" : startTime,
            endTime: mode === "full-day" ? "23:59" : endTime,
            reason,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "No se pudo bloquear el horario.");
        }

        setSuccess("Horario bloqueado correctamente.");
      }

      setReason("");
      await loadData();
      await onChanged?.();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo guardar el bloqueo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(block: ScheduleBlock) {
    const confirmed = window.confirm("¿Eliminar este bloqueo de horario?");

    if (!confirmed) return;

    await deleteFromApi(`/api/schedule-blocks/${block.id}`);
  }

  async function deleteVacation(groupId: string, count: number) {
    const confirmed = window.confirm(
      `¿Eliminar los ${count} días de esta vacación?`,
    );

    if (!confirmed) return;

    await deleteFromApi(
      `/api/schedule-blocks/range/${encodeURIComponent(groupId)}`,
    );
  }

  async function deleteFromApi(url: string) {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(url, { method: "DELETE" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No se pudo eliminar el bloqueo.");
      }

      setSuccess("Bloqueo eliminado correctamente.");
      await loadData();
      await onChanged?.();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo eliminar el bloqueo.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Present each vacation once, not once per blocked day.
  const grouped = new Map<string, ScheduleBlock[]>();

  for (const block of blocks) {
    const key = block.groupId ? `group-${block.groupId}` : `single-${block.id}`;

    const current = grouped.get(key) ?? [];
    current.push(block);
    grouped.set(key, current);
  }

  const entries = [...grouped.values()]
    .map((items) => [...items].sort((a, b) => a.date.localeCompare(b.date)))
    .sort((a, b) => b[0].date.localeCompare(a[0].date));

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/50 p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-manager-title"
        className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="schedule-manager-title"
              className="text-2xl font-bold text-neutral-900"
            >
              Gestionar horarios
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              Disponibilidad de las técnicas
            </p>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Cerrar gestionar horarios"
            className="min-h-11 min-w-11 rounded-xl border border-neutral-200 text-xl text-neutral-800 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["hours", "Por horas"],
              ["full-day", "Día completo"],
              ["vacation", "Varios días / Vacaciones"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onClick={() => {
                setMode(value);
                setError("");
                setSuccess("");
              }}
              className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ${
                mode === value
                  ? "bg-[#B76E79] text-white"
                  : "border border-neutral-200 text-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-neutral-800">
            Técnica
            <select
              value={employeeId}
              disabled={saving}
              onChange={(event) => setEmployeeId(Number(event.target.value))}
              className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base"
            >
              <option value={0}>Seleccionar técnica</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-neutral-800">
            {mode === "vacation" ? "Fecha de inicio" : "Fecha"}
            <input
              type="date"
              value={startDate}
              disabled={saving}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base"
            />
          </label>

          {mode === "vacation" ? (
            <label className="text-sm font-semibold text-neutral-800">
              Fecha de fin
              <input
                type="date"
                min={startDate}
                value={endDate}
                disabled={saving}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base"
              />
            </label>
          ) : mode === "hours" ? (
            <>
              <label className="text-sm font-semibold text-neutral-800">
                Desde
                <input
                  type="time"
                  value={startTime}
                  disabled={saving}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base"
                />
              </label>

              <label className="text-sm font-semibold text-neutral-800">
                Hasta
                <input
                  type="time"
                  value={endTime}
                  disabled={saving}
                  onChange={(event) => setEndTime(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base"
                />
              </label>
            </>
          ) : null}

          <label className="text-sm font-semibold text-neutral-800 sm:col-span-2">
            Motivo (opcional)
            <input
              type="text"
              maxLength={200}
              value={reason}
              disabled={saving}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ej. Vacaciones, llega tarde, cita médica"
              className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base"
            />
          </label>
        </div>

        {mode === "vacation" && (
          <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
            Se bloquearán todos los días del rango, incluyendo domingos y
            festivos. Las citas existentes no se cancelarán automáticamente.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {success && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800"
          >
            {success}
          </p>
        )}

        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void createBlock()}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#B76E79] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#a55e69] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {saving ? "Guardando..." : "Bloquear horario"}
        </button>

        <div className="mt-8 border-t border-neutral-200 pt-6">
          <h3 className="text-lg font-bold text-neutral-900">
            Horarios bloqueados
          </h3>

          {loading ? (
            <p className="mt-4 text-sm text-neutral-500">
              Cargando horarios...
            </p>
          ) : entries.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">
              No hay horarios bloqueados.
            </p>
          ) : (
            <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">
              {entries.map((items) => {
                const first = items[0];
                const last = items[items.length - 1];
                const isVacation = Boolean(first.groupId);

                return (
                  <div
                    key={first.groupId ?? first.id}
                    className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-neutral-900">
                        {first.employee.name}
                      </p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {formatDate(first.date.slice(0, 10))}
                        {isVacation &&
                          ` – ${formatDate(last.date.slice(0, 10))}`}
                      </p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {isVacation
                          ? `${items.length} días · Vacaciones`
                          : first.startTime === "00:00" &&
                              first.endTime === "23:59"
                            ? "Día completo"
                            : `${first.startTime} – ${first.endTime}`}
                      </p>
                      {first.reason && (
                        <p className="mt-1 text-sm text-neutral-500">
                          {first.reason}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        isVacation
                          ? void deleteVacation(first.groupId!, items.length)
                          : void deleteBlock(first)
                      }
                      className="min-h-11 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      {isVacation ? "Eliminar vacaciones" : "Eliminar"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="mt-5 text-xs text-neutral-500">
          Fecha actual en TEFF: {formatDate(getTeffToday())}
        </p>
      </div>
    </div>
  );
}
