"use client";

import { useEffect, useState } from "react";

type Service = {
  id: number;
  nameEs: string;
  category: string;
  active: boolean;
  assigned: boolean;
};

type EmployeeDetails = {
  id: number;
  name: string;
  active: boolean;
  isBookable: boolean;
  compensationType: "COMMISSION" | "FIXED_WEEKLY";
};

type QualificationsResponse = {
  employee: EmployeeDetails;
  services: Service[];
};

type Props = {
  employeeId: number;
  onClose: () => void;
};

const categoryNames: Record<string, string> = {
  NAILS: "Uñas",
  LASHES: "Pestañas",
  BROWS: "Cejas y Depilación",
  ESTHETICS: "Estética",
};

export default function EmployeeServicesEditor({ employeeId, onClose }: Props) {
  const [data, setData] = useState<QualificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setData(null);
      setError("");
      setSuccess("");

      try {
        const response = await fetch(
          `/api/admin/employees/${employeeId}/services`,
          { cache: "no-store" },
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ?? "No se pudieron cargar los servicios.",
          );
        }

        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Error al cargar los servicios.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  async function assignService(service: Service) {
    if (!data || savingId !== null) return;
    if (service.assigned || !service.active) return;
    if (!data.employee.active) return;
    if (data.employee.compensationType !== "COMMISSION") return;

    setSavingId(service.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/admin/employees/${employeeId}/services`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            serviceId: service.id,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo asignar el servicio.");
      }

      // Reload authoritative assignments from the server.
      const refreshResponse = await fetch(
        `/api/admin/employees/${employeeId}/services`,
        { cache: "no-store" },
      );

      const refreshed = await refreshResponse.json();

      if (!refreshResponse.ok) {
        throw new Error(
          refreshed.error ??
            "Servicio asignado, pero no se pudo actualizar la lista.",
        );
      }

      setData(refreshed);
      setSuccess(`Servicio asignado: ${service.nameEs}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo completar la operación.",
      );
    } finally {
      setSavingId(null);
    }
  }

  const categories = data
    ? [...new Set(data.services.map((service) => service.category))]
    : [];

  const assignedCount =
    data?.services.filter((service) => service.assigned).length ?? 0;

  const canAssign =
    data?.employee.active === true &&
    data.employee.compensationType === "COMMISSION";

  return (
    <div className="mt-4 rounded-xl border border-green-200 bg-green-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-neutral-900">Editar servicios</h4>

          <p className="mt-1 text-sm text-neutral-600">
            {data?.employee.name ?? "Cargando empleado..."}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={savingId !== null}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          Cerrar
        </button>
      </div>

      {loading && (
        <p className="mt-4 text-sm text-neutral-500">Cargando servicios...</p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {success && (
        <p role="status" className="mt-4 text-sm text-green-800">
          {success}
        </p>
      )}

      {!loading && data && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-white px-3 py-2 text-sm text-neutral-700">
            <span className="font-semibold text-green-800">
              {assignedCount} servicios asignados
            </span>

            <p className="mt-1 text-xs text-neutral-500">
              Las reservas se administran por separado.
            </p>
          </div>

          {categories.map((category) => (
            <div key={category} className="space-y-2">
              <h5 className="text-sm font-semibold text-neutral-900">
                {categoryNames[category] ?? category}
              </h5>

              <div className="space-y-2">
                {data.services
                  .filter((service) => service.category === category)
                  .map((service) => {
                    const isSaving = savingId === service.id;

                    const disabled =
                      !canAssign ||
                      !service.active ||
                      service.assigned ||
                      savingId !== null;

                    return (
                      <label
                        key={service.id}
                        className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={service.assigned}
                          disabled={disabled}
                          onChange={() => {
                            void assignService(service);
                          }}
                          className="h-4 w-4 accent-green-800 disabled:opacity-60"
                        />

                        <span className="min-w-0 flex-1 text-sm text-neutral-800">
                          {service.nameEs}

                          {!service.active && (
                            <span className="ml-2 text-xs text-neutral-500">
                              (Inactivo)
                            </span>
                          )}

                          {isSaving && (
                            <span className="ml-2 text-xs text-green-700">
                              Guardando...
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
              </div>
            </div>
          ))}

          {!canAssign && (
            <p className="text-xs text-amber-700">
              Este empleado no está habilitado para recibir nuevas asignaciones.
            </p>
          )}

          <p className="text-xs text-neutral-500">
            Marca un servicio para asignarlo. Los servicios ya asignados no se
            pueden quitar desde esta pantalla por ahora.
          </p>
        </div>
      )}
    </div>
  );
}
