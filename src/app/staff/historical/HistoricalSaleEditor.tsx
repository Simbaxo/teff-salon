"use client";

import { useEffect, useState } from "react";
import { getTeffToday } from "@/lib/datetime";
import MoneyInput from "@/components/MoneyInput";
import {
  calculateGelComboPrices,
  GEL_MANICURE_ID,
  GEL_PEDICURE_ID,
} from "@/lib/promotions/gel-mani-pedi";

type Service = {
  id: number;
  nameEs: string;
  price: number;
  estimatedDuration: number;
};

type Employee = {
  id: number;
  name: string;
  active: boolean;
};

type EmployeeService = {
  employeeId: number;
  serviceId: number;
};

type HistoricalServiceSelection = {
  serviceId: number;
  employeeId: number;
  price: number;
};

type Addon = {
  id: number;
  nameEs: string;
  price: number;
  estimatedDuration: number;
};

type ServiceAddonRelation = {
  serviceId: number;
  addonId: number;
};

type HistoricalAddonSelection = {
  addonId: number;
  serviceId: number;
  price: number;
};

type PaymentMethod = "CASH" | "BOLD" | "TRANSFER";

type HistoricalTip = {
  amount: number;
  paymentMethod: PaymentMethod;
};

export default function HistoricalSaleEditor() {
  const today = getTeffToday();

  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeServices, setEmployeeServices] = useState<EmployeeService[]>(
    [],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  // Anonymous walk-in customer.
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");

  const [selectedServices, setSelectedServices] = useState<
    HistoricalServiceSelection[]
  >([]);

  const [gelComboOriginalPrices, setGelComboOriginalPrices] = useState<{
    manicure: number;
    pedicure: number;
  } | null>(null);

  const [addons, setAddons] = useState<Addon[]>([]);
  const [serviceAddonRelations, setServiceAddonRelations] = useState<
    ServiceAddonRelation[]
  >([]);

  const [selectedAddons, setSelectedAddons] = useState<
    HistoricalAddonSelection[]
  >([]);

  const [discountMode, setDiscountMode] = useState<"FIXED" | "PERCENT">(
    "FIXED",
  );

  const [discountInput, setDiscountInput] = useState(0);

  const [payments, setPayments] = useState({
    CASH: 0,
    BOLD: 0,
    TRANSFER: 0,
  });

  const [tipsByEmployee, setTipsByEmployee] = useState<
    Record<number, HistoricalTip>
  >({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [completedSale, setCompletedSale] = useState<{
    saleId: number;
    bookingId: number;
    appointmentIds: number[];
    finalTotal: number;
  } | null>(null);

  // Calculate the historical sale totals from the selected line items.
  const servicesTotal = selectedServices.reduce(
    (total, service) => total + service.price,
    0,
  );

  const addonsTotal = selectedAddons.reduce(
    (total, addon) => total + addon.price,
    0,
  );

  const subtotal = servicesTotal + addonsTotal;

  const discount =
    discountMode === "PERCENT"
      ? Math.round((subtotal * Math.min(Math.max(discountInput, 0), 100)) / 100)
      : Math.round(Math.min(Math.max(discountInput, 0), subtotal));

  const finalTotal = Math.max(subtotal - discount, 0);

  // Technicians actually participating in this historical visit.
  const visitEmployeeIds = [
    ...new Set(
      selectedServices
        .map((service) => service.employeeId)
        .filter((employeeId) => employeeId > 0),
    ),
  ];

  // Cash tips go directly to the technician.
  // Electronic tips are collected by TEFF.
  const electronicTipTotal = Object.entries(tipsByEmployee).reduce(
    (total, [employeeId, tip]) => {
      if (
        !visitEmployeeIds.includes(Number(employeeId)) ||
        tip.paymentMethod === "CASH"
      ) {
        return total;
      }

      return total + tip.amount;
    },
    0,
  );

  const amountToCollect = finalTotal + electronicTipTotal;

  const paymentTotal = Object.values(payments).reduce(
    (total, amount) => total + amount,
    0,
  );

  // Match the Bold fee calculation used by Finalizar Servicio.
  // payments.BOLD excludes the customer-paid processing fee.
  const boldBase = payments.BOLD;

  const boldProcessingFee =
    boldBase <= 0 ? 0 : boldBase <= 100000 ? 5000 : Math.round(boldBase * 0.05);

  const boldCustomerCharge = boldBase + boldProcessingFee;

  const remainingPayment = amountToCollect - paymentTotal;

  useEffect(() => {
    async function loadFormData() {
      try {
        setIsLoading(true);
        setLoadError("");

        const [
          servicesResponse,
          employeesResponse,
          employeeServicesResponse,
          addonsResponse,
          serviceAddonsResponse,
        ] = await Promise.all([
          fetch("/api/services"),
          fetch("/api/employees"),
          fetch("/api/employee-services"),
          fetch("/api/addons"),
          fetch("/api/service-addons"),
        ]);

        if (
          !servicesResponse.ok ||
          !employeesResponse.ok ||
          !employeeServicesResponse.ok ||
          !addonsResponse.ok ||
          !serviceAddonsResponse.ok
        ) {
          throw new Error("No se pudo cargar la información del salón");
        }

        const [
          servicesData,
          employeesData,
          employeeServicesData,
          addonsData,
          serviceAddonsData,
        ] = await Promise.all([
          servicesResponse.json(),
          employeesResponse.json(),
          employeeServicesResponse.json(),
          addonsResponse.json(),
          serviceAddonsResponse.json(),
        ]);

        setServices(servicesData);
        setEmployees(employeesData);
        setEmployeeServices(employeeServicesData);
        setAddons(addonsData);
        setServiceAddonRelations(serviceAddonsData);
      } catch (error) {
        console.error(error);

        setLoadError("No se pudo cargar la información necesaria.");
      } finally {
        setIsLoading(false);
      }
    }

    loadFormData();
  }, []);

  // Keep tip fields synchronized with the technicians
  // currently participating in the historical visit.
  useEffect(() => {
    const synchronizeTips = () => {
      setTipsByEmployee((current) => {
        const next: Record<number, HistoricalTip> = {};

        for (const service of selectedServices) {
          const employeeId = service.employeeId;

          if (employeeId <= 0 || next[employeeId]) {
            continue;
          }

          next[employeeId] = current[employeeId] ?? {
            amount: 0,
            paymentMethod: "CASH",
          };
        }

        return next;
      });
    };

    void Promise.resolve().then(synchronizeTips);
  }, [selectedServices]);

  function selectZeroValue(event: React.FocusEvent<HTMLInputElement>) {
    if (event.currentTarget.value === "0") {
      event.currentTarget.select();
    }
  }

  function updatePayment(paymentMethod: PaymentMethod, amount: number) {
    setPayments((current) => ({
      ...current,
      [paymentMethod]: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    }));
  }

  function updateTip(employeeId: number, updates: Partial<HistoricalTip>) {
    setTipsByEmployee((current) => ({
      ...current,
      [employeeId]: {
        ...(current[employeeId] ?? {
          amount: 0,
          paymentMethod: "CASH",
        }),
        ...updates,
      },
    }));
  }

  const gelManicure = selectedServices.find(
    (item) => item.serviceId === GEL_MANICURE_ID,
  );

  const gelPedicure = selectedServices.find(
    (item) => item.serviceId === GEL_PEDICURE_ID,
  );

  const canApplyGelCombo =
    Boolean(gelManicure && gelPedicure) && gelComboOriginalPrices === null;

  function applyGelCombo() {
    if (!gelManicure || !gelPedicure || gelComboOriginalPrices !== null) {
      return;
    }

    const updated = calculateGelComboPrices(selectedServices);

    if (!updated) {
      setSubmitError("No se pudo aplicar la promoción.");
      return;
    }

    setGelComboOriginalPrices({
      manicure: gelManicure.price,
      pedicure: gelPedicure.price,
    });

    setSelectedServices(updated);
    setSubmitError("");
  }

  function removeGelCombo() {
    if (!gelComboOriginalPrices) return;

    setSelectedServices((current) =>
      current.map((item) => {
        if (item.serviceId === GEL_MANICURE_ID) {
          return { ...item, price: gelComboOriginalPrices.manicure };
        }

        if (item.serviceId === GEL_PEDICURE_ID) {
          return { ...item, price: gelComboOriginalPrices.pedicure };
        }

        return item;
      }),
    );

    setGelComboOriginalPrices(null);
  }

  function addService() {
    const selectedServiceIds = new Set(
      selectedServices.map((item) => item.serviceId),
    );

    const firstService = services.find(
      (service) => !selectedServiceIds.has(service.id),
    );

    if (!firstService) {
      return;
    }

    const qualifiedEmployees = employees.filter((employee) =>
      employeeServices.some(
        (relation) =>
          relation.employeeId === employee.id &&
          relation.serviceId === firstService.id,
      ),
    );

    setSelectedServices((current) => [
      ...current,
      {
        serviceId: firstService.id,
        employeeId: qualifiedEmployees[0]?.id ?? 0,
        price: firstService.price,
      },
    ]);
  }

  function updateSelectedService(
    index: number,
    updates: Partial<HistoricalServiceSelection>,
  ) {
    const editedService = selectedServices[index];

    const affectsCombo =
      gelComboOriginalPrices !== null &&
      editedService !== undefined &&
      (editedService.serviceId === GEL_MANICURE_ID ||
        editedService.serviceId === GEL_PEDICURE_ID) &&
      (updates.price !== undefined || updates.serviceId !== undefined);

    setSelectedServices((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex === index) {
          return { ...item, ...updates };
        }

        if (affectsCombo && gelComboOriginalPrices) {
          if (item.serviceId === GEL_MANICURE_ID) {
            return { ...item, price: gelComboOriginalPrices.manicure };
          }

          if (item.serviceId === GEL_PEDICURE_ID) {
            return { ...item, price: gelComboOriginalPrices.pedicure };
          }
        }

        return item;
      }),
    );

    if (affectsCombo) {
      setGelComboOriginalPrices(null);
    }
  }

  function changeService(index: number, serviceId: number) {
    const service = services.find((item) => item.id === serviceId);

    if (!service) {
      return;
    }

    const qualifiedEmployees = employees.filter((employee) =>
      employeeServices.some(
        (relation) =>
          relation.employeeId === employee.id &&
          relation.serviceId === serviceId,
      ),
    );

    updateSelectedService(index, {
      serviceId,
      employeeId: qualifiedEmployees[0]?.id ?? 0,
      price: service.price,
    });
  }

  function removeSelectedService(index: number) {
    const serviceId = selectedServices[index]?.serviceId;

    const removingComboService =
      serviceId === GEL_MANICURE_ID || serviceId === GEL_PEDICURE_ID;

    setSelectedServices((current) =>
      current
        .filter((_, itemIndex) => itemIndex !== index)
        .map((item) => {
          if (!removingComboService || !gelComboOriginalPrices) {
            return item;
          }

          if (item.serviceId === GEL_MANICURE_ID) {
            return { ...item, price: gelComboOriginalPrices.manicure };
          }

          if (item.serviceId === GEL_PEDICURE_ID) {
            return { ...item, price: gelComboOriginalPrices.pedicure };
          }

          return item;
        }),
    );

    if (removingComboService) {
      setGelComboOriginalPrices(null);
    }

    if (serviceId !== undefined) {
      setSelectedAddons((current) =>
        current.filter((addon) => addon.serviceId !== serviceId),
      );
    }
  }

  function addAddon(serviceId?: number) {
    const targetServiceId = serviceId ?? selectedServices[0]?.serviceId;

    if (!targetServiceId) {
      return;
    }

    const compatibleAddonIds = serviceAddonRelations
      .filter((relation) => relation.serviceId === targetServiceId)
      .map((relation) => relation.addonId);

    const firstAddon = addons.find((addon) =>
      compatibleAddonIds.includes(addon.id),
    );

    if (!firstAddon) {
      return;
    }

    setSelectedAddons((current) => [
      ...current,
      {
        addonId: firstAddon.id,
        serviceId: targetServiceId,
        price: firstAddon.price,
      },
    ]);
  }

  function updateSelectedAddon(
    index: number,
    updates: Partial<HistoricalAddonSelection>,
  ) {
    setSelectedAddons((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  }

  function changeAddonService(index: number, serviceId: number) {
    const compatibleAddonIds = serviceAddonRelations
      .filter((relation) => relation.serviceId === serviceId)
      .map((relation) => relation.addonId);

    const firstAddon = addons.find((addon) =>
      compatibleAddonIds.includes(addon.id),
    );

    if (!firstAddon) {
      return;
    }

    updateSelectedAddon(index, {
      serviceId,
      addonId: firstAddon.id,
      price: firstAddon.price,
    });
  }

  function changeAddon(index: number, addonId: number) {
    const addon = addons.find((item) => item.id === addonId);

    if (!addon) {
      return;
    }

    updateSelectedAddon(index, {
      addonId,
      price: addon.price,
    });
  }

  function removeSelectedAddon(index: number) {
    setSelectedAddons((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function submitHistoricalSale() {
    setSubmitError("");

    if (!date || !startTime) {
      setSubmitError("Selecciona la fecha y hora del servicio.");
      return;
    }

    if (!isWalkIn && !customerName.trim()) {
      setSubmitError(
        "Ingresa el nombre del cliente o selecciona Cliente Sin Cita.",
      );
      return;
    }

    if (selectedServices.length === 0) {
      setSubmitError("Agrega al menos un servicio.");
      return;
    }

    if (selectedServices.some((service) => service.employeeId <= 0)) {
      setSubmitError("Todos los servicios deben tener una técnica asignada.");
      return;
    }

    if (discount < 0 || discount > subtotal) {
      setSubmitError("El descuento no es válido.");
      return;
    }

    if (finalTotal <= 0) {
      setSubmitError("El total de la venta debe ser mayor que $0.");
      return;
    }

    if (paymentTotal !== amountToCollect) {
      setSubmitError(
        "Los pagos deben coincidir exactamente con el total a cobrar.",
      );
      return;
    }

    const confirmed = window.confirm(
      `Esta venta se registrará como completada el ${date} a las ${startTime}. ¿Deseas continuar?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch("/api/historical-sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          customerPhone,
          customerEmail,
          customerNotes,
          isWalkIn,
          date,
          startTime,

          services: selectedServices.map((service) => ({
            serviceId: service.serviceId,
            employeeId: service.employeeId,
            price: service.price,
          })),

          addons: selectedAddons.map((addon) => ({
            addonId: addon.addonId,
            serviceId: addon.serviceId,
            price: addon.price,
          })),

          discountTotal: discount,

          payments: (Object.entries(payments) as [PaymentMethod, number][])
            .filter(([, amount]) => amount > 0)
            .map(([paymentMethod, amount]) => ({
              paymentMethod,
              amount,
            })),

          tips: Object.entries(tipsByEmployee)
            .filter(
              ([employeeId, tip]) =>
                visitEmployeeIds.includes(Number(employeeId)) && tip.amount > 0,
            )
            .map(([employeeId, tip]) => ({
              employeeId: Number(employeeId),
              amount: tip.amount,
              paymentMethod: tip.paymentMethod,
            })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo registrar la venta anterior.",
        );
      }

      setCompletedSale(data);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la venta anterior.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
        <p className="text-neutral-500">Cargando información...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mt-8 rounded-xl bg-white p-5 shadow-sm">
        <p className="text-red-700">{loadError}</p>
      </div>
    );
  }

  if (completedSale) {
    return (
      <div className="mt-8 rounded-xl bg-white p-6 text-center shadow-sm">
        <p className="text-2xl font-bold text-black">
          Venta anterior registrada ✅
        </p>

        <p className="mt-2 text-neutral-500">
          La cita y la información financiera fueron guardadas correctamente.
        </p>

        <div className="mt-6 rounded-xl bg-neutral-100 p-4">
          <p className="text-sm text-neutral-500">
            Venta #{completedSale.saleId}
          </p>

          <p className="mt-1 text-2xl font-bold text-black">
            ${completedSale.finalTotal.toLocaleString("es-CO")}
          </p>

          <p className="mt-2 text-sm text-neutral-500">
            {completedSale.appointmentIds.length}{" "}
            {completedSale.appointmentIds.length === 1
              ? "servicio registrado"
              : "servicios registrados"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">
          Información de la Venta
        </h2>

        <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <div className="min-w-0">
            <label
              htmlFor="historical-date"
              className="block text-sm font-semibold text-black"
            >
              Fecha
            </label>

            <input
              id="historical-date"
              type="date"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-2 block w-full min-w-0 max-w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-black"
            />
          </div>

          <div className="min-w-0">
            <label
              htmlFor="historical-time"
              className="block text-sm font-semibold text-black"
            >
              Hora
            </label>

            <input
              id="historical-time"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="mt-2 block w-full min-w-0 max-w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-base text-black"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">Cliente</h2>

        <p className="mt-1 text-sm text-neutral-500">
          El teléfono es opcional. Si ingresas uno que ya existe, TEFF usará el
          perfil del cliente existente.
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <input
            type="checkbox"
            checked={isWalkIn}
            onChange={(event) => {
              const checked = event.target.checked;

              setIsWalkIn(checked);

              if (checked) {
                setCustomerName("");
                setCustomerPhone("");
                setCustomerEmail("");
              }
            }}
            className="h-5 w-5"
          />

          <div>
            <p className="font-semibold text-black">Cliente Sin Cita</p>

            <p className="mt-1 text-sm text-neutral-500">
              Usa esta opción cuando el cliente no proporciona nombre ni
              información de contacto.
            </p>
          </div>
        </label>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="historical-customer-name"
              className="block text-sm font-semibold text-black"
            >
              Nombre
            </label>

            <input
              id="historical-customer-name"
              type="text"
              disabled={isWalkIn}
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black disabled:bg-neutral-100 disabled:text-neutral-400"
              placeholder="Nombre del cliente"
            />
          </div>

          <div>
            <label
              htmlFor="historical-customer-phone"
              className="block text-sm font-semibold text-black"
            >
              Teléfono (opcional)
            </label>

            <input
              id="historical-customer-phone"
              type="tel"
              disabled={isWalkIn}
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
              placeholder="+57 300 000 0000 (opcional)"
            />
          </div>

          <div>
            <label
              htmlFor="historical-customer-email"
              className="block text-sm font-semibold text-black"
            >
              Correo
            </label>

            <input
              id="historical-customer-email"
              type="email"
              disabled={isWalkIn}
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
              placeholder="Opcional"
            />
          </div>

          <div>
            <label
              htmlFor="historical-customer-notes"
              className="block text-sm font-semibold text-black"
            >
              Notas
            </label>

            <input
              id="historical-customer-notes"
              type="text"
              value={customerNotes}
              onChange={(event) => setCustomerNotes(event.target.value)}
              className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
              placeholder="Opcional"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-black">Servicios</h2>

            <p className="mt-1 text-sm text-neutral-500">
              Agrega los servicios que realmente se realizaron.
            </p>
          </div>

          <button
            type="button"
            onClick={addService}
            className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
          >
            + Agregar servicio
          </button>
        </div>

        {selectedServices.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">
            No hay servicios agregados.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {selectedServices.map((selection, index) => {
              const qualifiedEmployees = employees.filter((employee) =>
                employeeServices.some(
                  (relation) =>
                    relation.employeeId === employee.id &&
                    relation.serviceId === selection.serviceId,
                ),
              );

              return (
                <div
                  key={index}
                  className="rounded-xl border border-neutral-200 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="block text-sm font-semibold text-black">
                        Servicio
                      </label>

                      <select
                        value={selection.serviceId}
                        onChange={(event) =>
                          changeService(index, Number(event.target.value))
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                      >
                        {services.map((service) => {
                          const selectedElsewhere = selectedServices.some(
                            (item, itemIndex) =>
                              itemIndex !== index &&
                              item.serviceId === service.id,
                          );

                          return (
                            <option
                              key={service.id}
                              value={service.id}
                              disabled={selectedElsewhere}
                            >
                              {service.nameEs}
                              {selectedElsewhere ? " — ya agregado" : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black">
                        Técnica
                      </label>

                      <select
                        value={selection.employeeId}
                        onChange={(event) =>
                          updateSelectedService(index, {
                            employeeId: Number(event.target.value),
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                      >
                        {qualifiedEmployees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black">
                        Precio
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="1000"
                        onFocus={selectZeroValue}
                        value={selection.price}
                        onChange={(event) =>
                          updateSelectedService(index, {
                            price: Number(event.target.value),
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => addAddon(selection.serviceId)}
                      className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                    >
                      + Agregar adicional
                    </button>

                    <button
                      type="button"
                      onClick={() => removeSelectedService(index)}
                      className="text-sm font-semibold text-red-600"
                    >
                      Quitar servicio
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-black">Adicionales</h2>

            <p className="mt-1 text-sm text-neutral-500">
              Cada adicional pertenece a uno de los servicios realizados.
            </p>
          </div>
        </div>

        {selectedAddons.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">
            No hay adicionales agregados.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            {selectedAddons.map((selection, index) => {
              const compatibleAddonIds = serviceAddonRelations
                .filter(
                  (relation) => relation.serviceId === selection.serviceId,
                )
                .map((relation) => relation.addonId);

              const compatibleAddons = addons.filter((addon) =>
                compatibleAddonIds.includes(addon.id),
              );

              return (
                <div
                  key={index}
                  className="rounded-xl border border-neutral-200 p-4"
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="block text-sm font-semibold text-black">
                        Servicio
                      </label>

                      <select
                        value={selection.serviceId}
                        onChange={(event) =>
                          changeAddonService(index, Number(event.target.value))
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                      >
                        {selectedServices.map(
                          (serviceSelection, serviceIndex) => {
                            const service = services.find(
                              (item) => item.id === serviceSelection.serviceId,
                            );

                            return (
                              <option
                                key={`${serviceSelection.serviceId}-${serviceIndex}`}
                                value={serviceSelection.serviceId}
                              >
                                {service?.nameEs ?? "Servicio"}
                              </option>
                            );
                          },
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black">
                        Adicional
                      </label>

                      <select
                        value={selection.addonId}
                        onChange={(event) =>
                          changeAddon(index, Number(event.target.value))
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                      >
                        {compatibleAddons.map((addon) => (
                          <option key={addon.id} value={addon.id}>
                            {addon.nameEs}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black">
                        Precio
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="1000"
                        onFocus={selectZeroValue}
                        value={selection.price}
                        onChange={(event) =>
                          updateSelectedAddon(index, {
                            price: Number(event.target.value),
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeSelectedAddon(index)}
                    className="mt-3 text-sm font-semibold text-red-600"
                  >
                    Quitar adicional
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">Resumen de Venta</h2>

        <div className="mt-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Servicios</span>
            <span className="font-semibold text-black">
              ${servicesTotal.toLocaleString("es-CO")}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-neutral-500">Adicionales</span>
            <span className="font-semibold text-black">
              ${addonsTotal.toLocaleString("es-CO")}
            </span>
          </div>

          <div className="flex justify-between border-t border-neutral-200 pt-3">
            <span className="font-semibold text-black">Subtotal</span>
            <span className="font-bold text-black">
              ${subtotal.toLocaleString("es-CO")}
            </span>
          </div>

          <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="font-semibold text-black">
              💅 Promo Manos y Pies Semi — $100.000
            </p>

            <p className="mt-1 text-sm text-neutral-600">
              Manicura Gel + Pedicura Gel. Solo se aplica cuando presionas el
              botón.
            </p>

            {gelComboOriginalPrices === null ? (
              <button
                type="button"
                disabled={!canApplyGelCombo}
                onClick={applyGelCombo}
                className="mt-3 rounded-lg bg-[#B76E79] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Aplicar promoción
              </button>
            ) : (
              <button
                type="button"
                onClick={removeGelCombo}
                className="mt-3 rounded-lg border border-[#B76E79] bg-white px-4 py-2 text-sm font-semibold text-[#B76E79]"
              >
                Quitar promoción
              </button>
            )}
          </div>

          <div>
            <label
              htmlFor="historical-discount"
              className="block text-sm font-semibold text-black"
            >
              Descuento
            </label>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setDiscountMode("FIXED");
                  setDiscountInput(0);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  discountMode === "FIXED"
                    ? "bg-black text-white"
                    : "border border-neutral-300 bg-white text-black"
                }`}
              >
                Valor fijo ($)
              </button>

              <button
                type="button"
                onClick={() => {
                  setDiscountMode("PERCENT");
                  setDiscountInput(0);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  discountMode === "PERCENT"
                    ? "bg-black text-white"
                    : "border border-neutral-300 bg-white text-black"
                }`}
              >
                Porcentaje (%)
              </button>
            </div>

            <MoneyInput
              value={discountInput}
              onChange={setDiscountInput}
              min={0}
              max={discountMode === "PERCENT" ? 100 : subtotal}
              step={discountMode === "PERCENT" ? 0.01 : 1}
              aria-label="Descuento"
              className="mt-3 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
            />

            <p className="mt-2 text-sm text-neutral-600">
              Descuento aplicado:{" "}
              <span className="font-semibold text-black">
                ${discount.toLocaleString("es-CO")} COP
              </span>
            </p>
          </div>

          <div className="flex justify-between border-t border-neutral-200 pt-4 text-lg">
            <span className="font-bold text-black">Total</span>
            <span className="font-bold text-black">
              ${finalTotal.toLocaleString("es-CO")}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">Pagos</h2>

        <p className="mt-1 text-sm text-neutral-500">
          Puedes dividir el pago entre varios métodos.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {(
            [
              ["CASH", "Efectivo"],
              ["BOLD", "Bold / Tarjeta"],
              ["TRANSFER", "Transferencia"],
            ] as [PaymentMethod, string][]
          ).map(([method, label]) => (
            <div key={method}>
              <label className="block text-sm font-semibold text-black">
                {label}
              </label>

              <input
                type="number"
                min="0"
                step="1000"
                onFocus={selectZeroValue}
                value={payments[method]}
                onChange={(event) =>
                  updatePayment(method, Number(event.target.value))
                }
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
              />

              <button
                type="button"
                onClick={() => {
                  setPayments({
                    CASH: 0,
                    BOLD: 0,
                    TRANSFER: 0,
                    [method]: amountToCollect,
                  });
                }}
                className="mt-2 text-xs font-semibold text-neutral-600 hover:text-black"
              >
                Pagar total aquí
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-xl bg-neutral-100 p-4">
          {boldBase > 0 && (
            <div className="mb-4 rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex justify-between text-sm text-black">
                <span>Pago por Bold</span>
                <span>${boldBase.toLocaleString("es-CO")}</span>
              </div>

              <div className="mt-2 flex justify-between text-sm text-black">
                <span>Recargo Bold</span>
                <span>${boldProcessingFee.toLocaleString("es-CO")}</span>
              </div>

              <div className="mt-3 flex justify-between border-t border-neutral-200 pt-2 font-bold text-black">
                <span>Total a cobrar por Bold</span>
                <span>${boldCustomerCharge.toLocaleString("es-CO")}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-neutral-600">Total a cobrar</span>
            <span className="font-semibold text-black">
              ${amountToCollect.toLocaleString("es-CO")}
            </span>
          </div>

          <div className="mt-2 flex justify-between text-sm">
            <span className="text-neutral-600">Pagado</span>
            <span className="font-semibold text-black">
              ${paymentTotal.toLocaleString("es-CO")}
            </span>
          </div>

          <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2">
            <span className="font-semibold text-black">
              {remainingPayment > 0
                ? "Falta"
                : remainingPayment < 0
                  ? "Exceso"
                  : "Pago completo"}
            </span>

            <span className="font-bold text-black">
              ${Math.abs(remainingPayment).toLocaleString("es-CO")}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">Propinas</h2>

        {visitEmployeeIds.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">
            Agrega un servicio para registrar propinas.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {visitEmployeeIds.map((employeeId) => {
              const employee = employees.find((item) => item.id === employeeId);

              const tip = tipsByEmployee[employeeId] ?? {
                amount: 0,
                paymentMethod: "CASH" as PaymentMethod,
              };

              return (
                <div
                  key={employeeId}
                  className="rounded-xl border border-neutral-200 p-4"
                >
                  <p className="font-semibold text-black">
                    {employee?.name ?? "Técnica"}
                  </p>

                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold text-black">
                        Propina
                      </label>

                      <input
                        type="number"
                        min="0"
                        step="1000"
                        onFocus={selectZeroValue}
                        value={tip.amount}
                        onChange={(event) =>
                          updateTip(employeeId, {
                            amount: Math.max(Number(event.target.value), 0),
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-black">
                        Método
                      </label>

                      <select
                        value={tip.paymentMethod}
                        onChange={(event) =>
                          updateTip(employeeId, {
                            paymentMethod: event.target.value as PaymentMethod,
                          })
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                      >
                        <option value="CASH">Efectivo</option>
                        <option value="BOLD">Bold / Tarjeta</option>
                        <option value="TRANSFER">Transferencia</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-black">
          Registrar Venta Anterior
        </h2>

        <p className="mt-2 text-sm text-neutral-500">
          La cita se guardará como completada en la fecha seleccionada y se
          incluirá en los reportes históricos de TEFF.
        </p>

        {submitError && (
          <div className="mt-4 rounded-xl bg-red-50 p-4">
            <p className="text-sm font-medium text-red-700">{submitError}</p>
          </div>
        )}

        <button
          type="button"
          disabled={
            isSubmitting ||
            selectedServices.length === 0 ||
            finalTotal <= 0 ||
            paymentTotal !== amountToCollect
          }
          onClick={submitHistoricalSale}
          className="mt-5 w-full rounded-xl bg-black px-5 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSubmitting ? "Registrando..." : "Registrar venta anterior"}
        </button>
      </div>
    </div>
  );
}
