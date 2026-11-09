"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = {
  id: number;
  name: string;
  active: boolean;
  isBookable: boolean;
  compensationType: "COMMISSION" | "FIXED_WEEKLY";
  weeklySalary: number;
  salaryStartDate: string | null;
};

export default function EmployeesManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompensationType, setNewCompensationType] = useState<
    "COMMISSION" | "FIXED_WEEKLY"
  >("COMMISSION");
  const [newWeeklySalary, setNewWeeklySalary] = useState("");

  async function updateEmployeeStatus(
    employee: Employee,
    changes: { active?: boolean; isBookable?: boolean },
  ) {
    if (updatingId !== null) return;

    if (changes.active === false) {
      const confirmed = window.confirm(
        `¿Desactivar a ${employee.name}?\n\n` +
          "No podrá recibir nuevas reservas. " +
          "Sus ventas y registros históricos se conservarán.",
      );

      if (!confirmed) return;
    }

    setUpdatingId(employee.id);
    setError("");

    try {
      const response = await fetch(`/api/admin/employees/${employee.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(changes),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo actualizar el empleado.");
      }

      setEmployees((current) =>
        current.map((item) =>
          item.id === employee.id
            ? {
                ...item,
                active: result.active,
                isBookable: result.isBookable,
              }
            : item,
        ),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Error al actualizar el empleado.",
      );
    } finally {
      setUpdatingId(null);
    }
  }

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/employees", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("No se pudo cargar el personal.");
      }

      const data: Employee[] = await response.json();
      setEmployees(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Error al cargar el personal.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  async function createEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (creating || updatingId !== null) return;

    const name = newName.trim();

    if (!name) {
      setError("Ingresa el nombre del empleado.");
      return;
    }

    const payload =
      newCompensationType === "COMMISSION"
        ? {
            name,
            compensationType: "COMMISSION",
            isBookable: false,
          }
        : {
            name,
            compensationType: "FIXED_WEEKLY",
            weeklySalary: Number(newWeeklySalary),
            isBookable: false,
          };

    if (
      newCompensationType === "FIXED_WEEKLY" &&
      (!Number.isSafeInteger(Number(newWeeklySalary)) ||
        Number(newWeeklySalary) <= 0)
    ) {
      setError("Ingresa un salario semanal válido.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo crear el empleado.");
      }

      setNewName("");
      setNewCompensationType("COMMISSION");
      setNewWeeklySalary("");
      setShowCreateForm(false);

      await loadEmployees();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Error al crear el empleado.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              Gestión de empleados
            </h2>
            <p className="text-sm text-neutral-600">
              Registra nuevos integrantes del equipo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateForm((current) => !current)}
            disabled={creating}
            className="rounded-lg bg-green-800 px-4 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-50"
          >
            {showCreateForm ? "Cancelar" : "+ Agregar empleado"}
          </button>
        </div>

        {showCreateForm && (
          <form onSubmit={createEmployee} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="employee-name"
                className="mb-1 block text-sm font-medium text-neutral-800"
              >
                Nombre
              </label>
              <input
                id="employee-name"
                required
                maxLength={100}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                placeholder="Nombre del empleado"
              />
            </div>

            <div>
              <label
                htmlFor="employee-compensation"
                className="mb-1 block text-sm font-medium text-neutral-800"
              >
                Tipo de compensación
              </label>
              <select
                id="employee-compensation"
                value={newCompensationType}
                onChange={(event) =>
                  setNewCompensationType(
                    event.target.value as "COMMISSION" | "FIXED_WEEKLY",
                  )
                }
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-900"
              >
                <option value="COMMISSION">Comisión (50%)</option>
                <option value="FIXED_WEEKLY">Salario semanal fijo</option>
              </select>
            </div>

            {newCompensationType === "FIXED_WEEKLY" && (
              <div>
                <label
                  htmlFor="employee-salary"
                  className="mb-1 block text-sm font-medium text-neutral-800"
                >
                  Salario semanal (COP)
                </label>
                <input
                  id="employee-salary"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={newWeeklySalary}
                  onChange={(event) => setNewWeeklySalary(event.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-neutral-900"
                />
              </div>
            )}

            <p className="text-sm text-neutral-600">
              El empleado se creará activo, pero con las reservas deshabilitadas
              hasta que se autoricen.
            </p>

            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-green-800 px-5 py-2 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-50"
            >
              {creating ? "Guardando..." : "Guardar empleado"}
            </button>
          </form>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-neutral-900">Empleados</h2>

        <button
          type="button"
          onClick={() => void loadEmployees()}
          disabled={loading}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>

      {loading && (
        <p className="text-sm text-neutral-500">Cargando empleados...</p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && !error && employees.length === 0 && (
        <p className="text-sm text-neutral-500">
          No hay empleados registrados.
        </p>
      )}

      {!loading && !error && employees.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {employees.map((employee) => (
            <article
              key={employee.id}
              className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-neutral-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-neutral-900">
                    {employee.name}
                  </h3>

                  <p className="mt-1 text-sm text-neutral-600">
                    {employee.compensationType === "COMMISSION"
                      ? "Comisión · 50%"
                      : `Salario semanal · ${employee.weeklySalary.toLocaleString("es-CO")} COP`}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    employee.active
                      ? "bg-green-100 text-green-800"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {employee.active ? "Activo" : "Inactivo"}
                </span>
              </div>

              <div className="mt-4 border-t border-neutral-100 pt-3">
                <p className="text-sm text-neutral-600">
                  Reservas:{" "}
                  <span className="font-medium text-neutral-900">
                    {employee.active && employee.isBookable
                      ? "Habilitadas"
                      : "Deshabilitadas"}
                  </span>
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={updatingId !== null}
                  onClick={() =>
                    void updateEmployeeStatus(employee, {
                      active: !employee.active,
                    })
                  }
                  className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
                    employee.active
                      ? "border-red-200 text-red-700 hover:bg-red-50"
                      : "border-green-300 text-green-800 hover:bg-green-50"
                  }`}
                >
                  {updatingId === employee.id
                    ? "Guardando..."
                    : employee.active
                      ? "Desactivar"
                      : "Activar"}
                </button>

                {employee.active && (
                  <button
                    type="button"
                    disabled={updatingId !== null}
                    onClick={() =>
                      void updateEmployeeStatus(employee, {
                        isBookable: !employee.isBookable,
                      })
                    }
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {employee.isBookable
                      ? "Deshabilitar reservas"
                      : "Habilitar reservas"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
