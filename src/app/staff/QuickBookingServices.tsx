"use client";

import { useEffect, useState } from "react";

export type QuickBookingServiceSelection = {
  serviceId: number;
  employeeId: number | null;
};

type CatalogService = {
  id: number;
  nameEs: string;
  category: string;
  price: number;
  estimatedDuration: number;
  requiresApproval: boolean;
  qualifiedEmployeeIds: number[];
};

type CatalogEmployee = {
  id: number;
  name: string;
};

type Props = {
  value: QuickBookingServiceSelection[];
  onChange: (services: QuickBookingServiceSelection[]) => void;
};

const SERVICE_CATEGORIES = [
  {
    id: "NAILS",
    label: "Uñas",
    emoji: "💅",
    color: "bg-pink-100 text-pink-800",
  },
  {
    id: "LASHES",
    label: "Pestañas",
    emoji: "👁️",
    color: "bg-purple-100 text-purple-800",
  },
  {
    id: "BROWS",
    label: "Cejas y Depilación",
    emoji: "✨",
    color: "bg-amber-100 text-amber-900",
  },
  {
    id: "ESTHETICS",
    label: "Estética",
    emoji: "🌿",
    color: "bg-green-100 text-green-800",
  },
] as const;

function formatMoney(amount: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function QuickBookingServices({ value, onChange }: Props) {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [employees, setEmployees] = useState<CatalogEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCatalog() {
      try {
        const response = await fetch("/api/staff/quick-booking/catalog", {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = (await response.json()) as {
          services?: CatalogService[];
          employees?: CatalogEmployee[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "No se pudo cargar el catálogo.");
        }

        if (controller.signal.aborted) return;

        setServices(data.services ?? []);
        setEmployees(data.employees ?? []);
      } catch (cause) {
        if (controller.signal.aborted) return;

        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo cargar el catálogo.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadCatalog();

    return () => controller.abort();
  }, []);

  const orderedServices = [...services].sort((a, b) => {
    const indexA = SERVICE_CATEGORIES.findIndex(
      (category) => category.id === a.category,
    );

    const indexB = SERVICE_CATEGORIES.findIndex(
      (category) => category.id === b.category,
    );

    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;

    return orderA - orderB || a.nameEs.localeCompare(b.nameEs, "es");
  });

  function addService() {
    const selectedIds = new Set(value.map((item) => item.serviceId));

    const available = orderedServices.find(
      (service) =>
        service.qualifiedEmployeeIds.length > 0 && !selectedIds.has(service.id),
    );

    if (!available) return;

    onChange([
      ...value,
      {
        serviceId: available.id,
        employeeId: null,
      },
    ]);
  }

  function updateService(index: number, serviceId: number) {
    if (
      value.some(
        (item, itemIndex) =>
          itemIndex !== index && item.serviceId === serviceId,
      )
    ) {
      return;
    }

    onChange(
      value.map((item, itemIndex) =>
        itemIndex === index ? { serviceId, employeeId: null } : item,
      ),
    );
  }

  function updateEmployee(index: number, employeeId: number | null) {
    onChange(
      value.map((item, itemIndex) =>
        itemIndex === index ? { ...item, employeeId } : item,
      ),
    );
  }

  function removeService(index: number) {
    onChange(value.filter((_, itemIndex) => itemIndex !== index));
  }

  const selectedServices = value
    .map((item) => services.find((service) => service.id === item.serviceId))
    .filter((service): service is CatalogService => Boolean(service));

  const totalPrice = selectedServices.reduce(
    (total, service) => total + service.price,
    0,
  );

  const totalDuration = selectedServices.reduce(
    (total, service) => total + service.estimatedDuration,
    0,
  );

  const canAddAnother = services.some(
    (service) =>
      service.qualifiedEmployeeIds.length > 0 &&
      !value.some((item) => item.serviceId === service.id),
  );

  if (loading) {
    return (
      <p className="text-sm text-neutral-600">
        Cargando servicios y técnicas...
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-700">
        {error}
      </p>
    );
  }

  return (
    <section className="space-y-4">
      {value.map((selection, index) => {
        const selectedService = services.find(
          (service) => service.id === selection.serviceId,
        );

        const qualifiedEmployees = employees.filter((employee) =>
          selectedService?.qualifiedEmployeeIds.includes(employee.id),
        );

        const selectedCategory = SERVICE_CATEGORIES.find(
          (category) => category.id === selectedService?.category,
        );

        const categoryCardColor = {
          NAILS: "border-pink-300 bg-pink-50",
          LASHES: "border-purple-300 bg-purple-50",
          BROWS: "border-amber-300 bg-amber-50",
          ESTHETICS: "border-green-300 bg-green-50",
        } as const;

        const cardColor =
          categoryCardColor[
            selectedService?.category as keyof typeof categoryCardColor
          ] ?? "border-neutral-200 bg-neutral-50";

        return (
          <div
            key={index}
            className={`space-y-3 rounded-xl border p-4 ${cardColor}`}
          >
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-semibold text-black">Servicio {index + 1}</h4>

              <button
                type="button"
                onClick={() => removeService(index)}
                className="text-sm font-semibold text-red-700"
              >
                Eliminar
              </button>
            </div>

            <div>
              <label
                htmlFor={`quick-service-${index}`}
                className="block text-sm font-medium text-black"
              >
                Servicio
              </label>

              <select
                id={`quick-service-${index}`}
                value={selection.serviceId}
                onChange={(event) =>
                  updateService(index, Number(event.target.value))
                }
                className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-black"
              >
                {SERVICE_CATEGORIES.map((category) => {
                  const categoryServices = orderedServices.filter(
                    (service) =>
                      service.category === category.id &&
                      service.qualifiedEmployeeIds.length > 0 &&
                      (service.id === selection.serviceId ||
                        !value.some((item) => item.serviceId === service.id)),
                  );

                  if (categoryServices.length === 0) return null;

                  return (
                    <optgroup
                      key={category.id}
                      label={`${category.emoji} ${category.label}`}
                    >
                      {categoryServices.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.nameEs}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}

                {orderedServices
                  .filter(
                    (service) =>
                      !SERVICE_CATEGORIES.some(
                        (category) => category.id === service.category,
                      ) &&
                      service.qualifiedEmployeeIds.length > 0 &&
                      (service.id === selection.serviceId ||
                        !value.some((item) => item.serviceId === service.id)),
                  )
                  .map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.nameEs}
                    </option>
                  ))}
                {selectedService && (
                  <div className="mt-3">
                    {SERVICE_CATEGORIES.filter(
                      (category) => category.id === selectedService.category,
                    ).map((category) => (
                      <span
                        key={category.id}
                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold ${category.color}`}
                      >
                        {category.emoji} {category.label}
                      </span>
                    ))}
                  </div>
                )}
              </select>

              {selectedService && (
                <p className="mt-2 text-sm text-neutral-600">
                  {formatMoney(selectedService.price)} ·{" "}
                  {selectedService.estimatedDuration} min
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor={`quick-employee-${index}`}
                className="block text-sm font-medium text-black"
              >
                Técnica
              </label>

              <select
                id={`quick-employee-${index}`}
                value={selection.employeeId ?? ""}
                onChange={(event) =>
                  updateEmployee(
                    index,
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-3 text-base text-black"
              >
                <option value="">Seleccionar técnica</option>

                {qualifiedEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedService?.requiresApproval && (
              <p className="text-sm text-amber-700">
                Este servicio requiere aprobación.
              </p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addService}
        disabled={!canAddAnother}
        className="min-h-12 w-full rounded-xl border border-[#1F5A43] bg-white px-4 py-3 text-sm font-semibold text-[#1F5A43] hover:bg-neutral-50 disabled:opacity-50"
      >
        + Agregar servicio
      </button>

      {value.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="font-semibold text-black">Resumen de servicios</p>

          <div className="mt-3 flex justify-between text-sm">
            <span className="text-neutral-600">Duración estimada</span>
            <span className="font-medium">{totalDuration} min</span>
          </div>

          <div className="mt-2 flex justify-between">
            <span className="font-semibold">Total estimado</span>
            <span className="font-bold text-[#1F5A43]">
              {formatMoney(totalPrice)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
