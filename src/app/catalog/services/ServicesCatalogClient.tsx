"use client";

import { useEffect, useMemo, useState } from "react";

type Service = {
    id: number;
    nameEs: string;
    nameEn: string;
    category: string;
    price: number;
    estimatedDuration: number;
    requiresApproval: boolean;
    active: boolean;
};

type BookableEmployee = {
    id: number;
    name: string;
};

type StatusFilter =
    | "ALL"
    | "ACTIVE"
    | "INACTIVE";

const SERVICE_CATEGORIES = [
    "NAILS",
    "LASHES",
    "BROWS",
    "ESTHETICS",
] as const;

function formatCOP(value: number) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
    }).format(value);
}

function getCategoryLabel(category: string) {
    switch (category) {
        case "NAILS":
            return "Uñas";
        case "LASHES":
            return "Pestañas";
        case "BROWS":
            return "Cejas";
        case "ESTHETICS":
            return "Estética";
        default:
            return category;
    }
}

export default function ServicesCatalogClient() {
    const [services, setServices] =
        useState<Service[]>([]);

    const [bookableEmployees, setBookableEmployees] =
        useState<BookableEmployee[]>([]);

    const [selectedEmployeeIds, setSelectedEmployeeIds] =
        useState<number[]>([]);

    const [employeesLoading, setEmployeesLoading] =
        useState(false);

    const [employeesError, setEmployeesError] =
        useState("");

    const [isLoading, setIsLoading] =
        useState(true);

    const [loadError, setLoadError] =
        useState("");

    const [search, setSearch] =
        useState("");

    const [statusFilter, setStatusFilter] =
        useState<StatusFilter>("ALL");

    const [categoryFilter, setCategoryFilter] =
        useState("ALL");

    // Create-service modal.
    const [showCreateModal, setShowCreateModal] =
        useState(false);

    // Edit-service modal.
    const [editingService, setEditingService] =
        useState<Service | null>(null);

    // Shared service form fields.
    const [formNameEs, setFormNameEs] =
        useState("");

    const [formNameEn, setFormNameEn] =
        useState("");

    const [formCategory, setFormCategory] =
        useState("NAILS");

    const [formPrice, setFormPrice] =
        useState("");

    const [formDuration, setFormDuration] =
        useState("");

    const [formRequiresApproval, setFormRequiresApproval] =
        useState(false);

    const [formActive, setFormActive] =
        useState(true);

    const [formError, setFormError] =
        useState("");

    const [isSaving, setIsSaving] =
        useState(false);

    async function loadServices() {
        try {
            setIsLoading(true);
            setLoadError("");

            const response = await fetch(
                "/api/catalog/services"
            );

            if (!response.ok) {
                throw new Error(
                    "No se pudo cargar el catálogo"
                );
            }

            const data: Service[] =
                await response.json();

            setServices(data);
        } catch (error) {
            console.error(error);

            setLoadError(
                "No se pudo cargar el catálogo de servicios."
            );
        } finally {
            setIsLoading(false);
        }
    }

    async function loadBookableEmployees() {
        setEmployeesLoading(true);
        setEmployeesError("");

        try {
            const response = await fetch("/api/employees", {
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error("No se pudieron cargar las técnicas.");
            }

            const data: BookableEmployee[] = await response.json();

            setBookableEmployees(
                data.map((employee) => ({
                    id: employee.id,
                    name: employee.name,
                }))
            );
        } catch (error) {
            console.error(error);
            setBookableEmployees([]);
            setEmployeesError(
                "No se pudieron cargar las técnicas disponibles."
            );
        } finally {
            setEmployeesLoading(false);
        }
    }

    function resetForm() {
        setFormNameEs("");
        setFormNameEn("");
        setFormCategory("NAILS");
        setFormPrice("");
        setFormDuration("");
        setFormRequiresApproval(false);
        setFormActive(true);
        setFormError("");
        setSelectedEmployeeIds([]);
        setEmployeesError("");
    }

    function openCreateModal() {
        resetForm();
        setEditingService(null);
        void loadBookableEmployees();
        setShowCreateModal(true);
    }

    function openEditModal(service: Service) {
        setShowCreateModal(false);
        setEditingService(service);

        setFormNameEs(service.nameEs);
        setFormNameEn(service.nameEn);
        setFormCategory(service.category);
        setFormPrice(String(service.price));
        setFormDuration(
            String(service.estimatedDuration)
        );
        setFormRequiresApproval(
            service.requiresApproval
        );
        setFormActive(service.active);
        setFormError("");
    }

    async function createService() {
        setFormError("");

        const price = Number(formPrice);
        const estimatedDuration =
            Number(formDuration);

        if (
            !formNameEs.trim() ||
            !formNameEn.trim() ||
            !formCategory ||
            !Number.isInteger(price) ||
            price < 0 ||
            !Number.isInteger(
                estimatedDuration
            ) ||
            estimatedDuration <= 0 ||
            selectedEmployeeIds.length === 0
        ) {
            setFormError(
                "Completa los campos obligatorios y selecciona al menos una técnica."
            );
            return;
        }

        try {
            setIsSaving(true);

            const response = await fetch(
                "/api/catalog/services",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        nameEs:
                            formNameEs.trim(),
                        nameEn:
                            formNameEn.trim(),
                        category:
                            formCategory,
                        price,
                        estimatedDuration,
                        requiresApproval:
                            formRequiresApproval,
                        employeeIds: selectedEmployeeIds,
                    }),
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "No se pudo crear el servicio."
                );
            }

            setShowCreateModal(false);
            resetForm();

            await loadServices();
        } catch (error) {
            console.error(error);

            setFormError(
                error instanceof Error
                    ? error.message
                    : "No se pudo crear el servicio."
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function updateService() {
        if (!editingService) {
            return;
        }

        setFormError("");

        const price = Number(formPrice);
        const estimatedDuration =
            Number(formDuration);

        if (
            !formNameEs.trim() ||
            !formNameEn.trim() ||
            !formCategory ||
            !Number.isInteger(price) ||
            price < 0 ||
            !Number.isInteger(
                estimatedDuration
            ) ||
            estimatedDuration <= 0
        ) {
            setFormError(
                "Completa correctamente todos los campos obligatorios."
            );
            return;
        }

        try {
            setIsSaving(true);

            const response = await fetch(
                `/api/catalog/services/${editingService.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        nameEs:
                            formNameEs.trim(),
                        nameEn:
                            formNameEn.trim(),
                        category:
                            formCategory,
                        price,
                        estimatedDuration,
                        requiresApproval:
                            formRequiresApproval,
                        active:
                            formActive,
                    }),
                }
            );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "No se pudo actualizar el servicio."
                );
            }

            setEditingService(null);
            resetForm();

            await loadServices();
        } catch (error) {
            console.error(error);

            setFormError(
                error instanceof Error
                    ? error.message
                    : "No se pudo actualizar el servicio."
            );
        } finally {
            setIsSaving(false);
        }
    }

    useEffect(() => {
        loadServices();
    }, []);

    const filteredServices = useMemo(() => {
        const normalizedSearch =
            search.trim().toLowerCase();

        return services.filter((service) => {
            const matchesSearch =
                !normalizedSearch ||
                service.nameEs
                    .toLowerCase()
                    .includes(normalizedSearch) ||
                service.nameEn
                    .toLowerCase()
                    .includes(normalizedSearch);

            const matchesStatus =
                statusFilter === "ALL" ||
                (statusFilter === "ACTIVE" &&
                    service.active) ||
                (statusFilter === "INACTIVE" &&
                    !service.active);

            const matchesCategory =
                categoryFilter === "ALL" ||
                service.category ===
                    categoryFilter;

            return (
                matchesSearch &&
                matchesStatus &&
                matchesCategory
            );
        });
    }, [
        services,
        search,
        statusFilter,
        categoryFilter,
    ]);

    const activeCount = services.filter(
        (service) => service.active
    ).length;

    const inactiveCount = services.filter(
        (service) => !service.active
    ).length;

    return (
        <div className="mt-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <input
                    type="search"
                    value={search}
                    onChange={(event) =>
                        setSearch(
                            event.target.value
                        )
                    }
                    placeholder="Buscar servicio..."
                    className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black lg:max-w-md"
                />

                <button
                    type="button"
                    onClick={openCreateModal}
                    className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white"
                >
                    + Agregar servicio
                </button>
            </div>

            <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end">
                <div>
                    <label className="block text-sm font-semibold text-black">
                        Categoría
                    </label>

                    <select
                        value={categoryFilter}
                        onChange={(event) =>
                            setCategoryFilter(
                                event.target.value
                            )
                        }
                        className="mt-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                    >
                        <option value="ALL">
                            Todas
                        </option>

                        {SERVICE_CATEGORIES.map(
                            (category) => (
                                <option
                                    key={category}
                                    value={category}
                                >
                                    {getCategoryLabel(
                                        category
                                    )}
                                </option>
                            )
                        )}
                    </select>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter("ALL")
                        }
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            statusFilter === "ALL"
                                ? "bg-black text-white"
                                : "bg-white text-black"
                        }`}
                    >
                        Todos ({services.length})
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter(
                                "ACTIVE"
                            )
                        }
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            statusFilter ===
                            "ACTIVE"
                                ? "bg-black text-white"
                                : "bg-white text-black"
                        }`}
                    >
                        Activos ({activeCount})
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setStatusFilter(
                                "INACTIVE"
                            )
                        }
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            statusFilter ===
                            "INACTIVE"
                                ? "bg-black text-white"
                                : "bg-white text-black"
                        }`}
                    >
                        Inactivos ({inactiveCount})
                    </button>
                </div>
            </div>

            <div className="mt-6">
                {isLoading && (
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-neutral-500">
                            Cargando catálogo...
                        </p>
                    </div>
                )}

                {loadError && (
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="font-semibold text-red-700">
                            {loadError}
                        </p>

                        <button
                            type="button"
                            onClick={loadServices}
                            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {!isLoading &&
                    !loadError &&
                    filteredServices.length ===
                        0 && (
                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-neutral-500">
                                No se encontraron servicios.
                            </p>
                        </div>
                    )}

                {!isLoading &&
                    !loadError &&
                    filteredServices.length >
                        0 && (
                        <div className="grid gap-4 lg:grid-cols-2">
                            {filteredServices.map(
                                (service) => (
                                    <div
                                        key={
                                            service.id
                                        }
                                        className="rounded-xl bg-white p-5 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-lg font-bold text-black">
                                                    {
                                                        service.nameEs
                                                    }
                                                </p>

                                                <p className="mt-1 text-sm text-neutral-500">
                                                    {
                                                        service.nameEn
                                                    }
                                                </p>

                                                <p className="mt-2 text-sm font-medium text-neutral-600">
                                                    {getCategoryLabel(
                                                        service.category
                                                    )}
                                                </p>
                                            </div>

                                            <span
                                                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                                    service.active
                                                        ? "bg-green-100 text-green-800"
                                                        : "bg-neutral-200 text-neutral-700"
                                                }`}
                                            >
                                                {service.active
                                                    ? "Activo"
                                                    : "Inactivo"}
                                            </span>
                                        </div>

                                        <div className="mt-5 grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-xs text-neutral-500">
                                                    Precio
                                                </p>

                                                <p className="mt-1 font-bold text-black">
                                                    {formatCOP(
                                                        service.price
                                                    )}
                                                </p>
                                            </div>

                                            <div>
                                                <p className="text-xs text-neutral-500">
                                                    Duración
                                                </p>

                                                <p className="mt-1 font-bold text-black">
                                                    {
                                                        service.estimatedDuration
                                                    }{" "}
                                                    min
                                                </p>
                                            </div>
                                        </div>

                                        {service.requiresApproval && (
                                            <p className="mt-4 text-sm font-semibold text-amber-700">
                                                Requiere aprobación
                                            </p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() =>
                                                openEditModal(service)
                                            }
                                            className="mt-5 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                                        >
                                            Editar
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    )}
            </div>

                        {/* Create / edit service modal */}
            {(showCreateModal || editingService) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-bold text-black">
                                    {editingService
                                        ? "Editar servicio"
                                        : "Agregar servicio"}
                                </h2>

                                <p className="mt-1 text-sm text-neutral-500">
                                    {editingService
                                        ? "Actualiza la información y disponibilidad del servicio."
                                        : "Agrega un nuevo servicio al catálogo de TEFF."}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setEditingService(null);
                                    resetForm();
                                }}
                                className="text-sm font-semibold text-neutral-500 hover:text-black"
                            >
                                Cerrar
                            </button>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-semibold text-black">
                                    Nombre en español
                                </label>

                                <input
                                    type="text"
                                    value={formNameEs}
                                    onChange={(event) =>
                                        setFormNameEs(
                                            event.target.value
                                        )
                                    }
                                    placeholder="Ej. Manicura Tradicional"
                                    className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-black">
                                    Nombre en inglés
                                </label>

                                <input
                                    type="text"
                                    value={formNameEn}
                                    onChange={(event) =>
                                        setFormNameEn(
                                            event.target.value
                                        )
                                    }
                                    placeholder="Ej. Traditional Manicure"
                                    className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-black">
                                    Categoría
                                </label>

                                <select
                                    value={formCategory}
                                    onChange={(event) =>
                                        setFormCategory(
                                            event.target.value
                                        )
                                    }
                                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                                >
                                    {SERVICE_CATEGORIES.map(
                                        (category) => (
                                            <option
                                                key={category}
                                                value={category}
                                            >
                                                {getCategoryLabel(
                                                    category
                                                )}
                                            </option>
                                        )
                                    )}
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
                                    value={formPrice}
                                    onFocus={(event) =>
                                        event.currentTarget.select()
                                    }
                                    onChange={(event) =>
                                        setFormPrice(
                                            event.target.value
                                        )
                                    }
                                    placeholder="45000"
                                    className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                                />

                                {formPrice &&
                                    Number(formPrice) >= 0 && (
                                        <p className="mt-2 text-xs text-neutral-500">
                                            {formatCOP(
                                                Number(
                                                    formPrice
                                                )
                                            )}
                                        </p>
                                    )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-black">
                                    Duración estimada
                                </label>

                                <input
                                    type="number"
                                    min="1"
                                    step="5"
                                    value={formDuration}
                                    onFocus={(event) =>
                                        event.currentTarget.select()
                                    }
                                    onChange={(event) =>
                                        setFormDuration(
                                            event.target.value
                                        )
                                    }
                                    placeholder="60"
                                    className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                                />

                                <p className="mt-2 text-xs text-neutral-500">
                                    Duración en minutos.
                                </p>
                            </div>
                        </div>

                        {!editingService && (
                            <div className="mt-6 rounded-xl border border-neutral-200 p-4">
                                <h3 className="font-semibold text-black">
                                    Técnicas asignadas
                                </h3>

                                <p className="mt-1 text-sm text-neutral-500">
                                    Selecciona quiénes pueden realizar este servicio.
                                </p>

                                {employeesLoading ? (
                                    <p className="mt-3 text-sm text-neutral-500">
                                        Cargando técnicas...
                                    </p>
                                ) : employeesError ? (
                                    <p role="alert" className="mt-3 text-sm text-red-700">
                                        {employeesError}
                                    </p>
                                ) : bookableEmployees.length === 0 ? (
                                    <p className="mt-3 text-sm text-amber-700">
                                        No hay técnicas disponibles.
                                    </p>
                                ) : (
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {bookableEmployees.map((employee) => (
                                            <label
                                                key={employee.id}
                                                className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 p-3"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedEmployeeIds.includes(employee.id)}
                                                    onChange={(event) => {
                                                        setSelectedEmployeeIds((current) =>
                                                            event.target.checked
                                                                ? [...current, employee.id]
                                                                : current.filter((id) => id !== employee.id)
                                                        );
                                                    }}
                                                    className="h-5 w-5"
                                                />
                                                <span className="text-sm font-medium text-black">
                                                    {employee.name}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="mt-6 space-y-3">
                            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4">
                                <div>
                                    <p className="font-semibold text-black">
                                        Requiere aprobación
                                    </p>

                                    <p className="mt-1 text-sm text-neutral-500">
                                        Úsalo para servicios que necesitan confirmación antes de aceptar la cita.
                                    </p>
                                </div>

                                <input
                                    type="checkbox"
                                    checked={
                                        formRequiresApproval
                                    }
                                    onChange={(event) =>
                                        setFormRequiresApproval(
                                            event.target.checked
                                        )
                                    }
                                    className="h-5 w-5"
                                />
                            </label>

                            {editingService && (
                                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-neutral-200 p-4">
                                    <div>
                                        <p className="font-semibold text-black">
                                            Servicio activo
                                        </p>

                                        <p className="mt-1 text-sm text-neutral-500">
                                            Los servicios inactivos dejan de aparecer en el catálogo público de reservas.
                                        </p>
                                    </div>

                                    <input
                                        type="checkbox"
                                        checked={formActive}
                                        onChange={(event) =>
                                            setFormActive(
                                                event.target.checked
                                            )
                                        }
                                        className="h-5 w-5"
                                    />
                                </label>
                            )}
                        </div>

                        {formError && (
                            <p className="mt-5 text-sm font-medium text-red-700">
                                {formError}
                            </p>
                        )}

                        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCreateModal(false);
                                    setEditingService(null);
                                    resetForm();
                                }}
                                disabled={isSaving}
                                className="rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-50"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={
                                    editingService
                                        ? updateService
                                        : createService
                                }
                                disabled={isSaving}
                                className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {isSaving
                                    ? "Guardando..."
                                    : editingService
                                    ? "Guardar cambios"
                                    : "Crear servicio"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}