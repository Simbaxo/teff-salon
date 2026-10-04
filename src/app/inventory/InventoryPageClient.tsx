"use client";

import { useEffect, useMemo, useState } from "react";

type InventoryStatus =
    | "IN_STOCK"
    | "LOW_STOCK"
    | "OUT_OF_STOCK";

type InventoryItem = {
    id: number;
    name: string;
    category: string | null;
    unit: string;
    quantity: number;
    lowStockThreshold: number;
    active: boolean;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    status: InventoryStatus;
};

type FilterOption =
    | "ALL"
    | "LOW_STOCK"
    | "OUT_OF_STOCK"
    | "INACTIVE";

const INVENTORY_CATEGORIES = [
    "Uñas",
    "Pestañas",
    "Estética",
    "Limpieza",
    "Desechables",
    "Oficina",
    "Otros",
] as const;

type InventoryCategory =
    (typeof INVENTORY_CATEGORIES)[number];

type InventoryMovementType =
    | "RESTOCK"
    | "USAGE"
    | "DAMAGED"
    | "CORRECTION";

type InventoryMovement = {
    id: number;
    type: InventoryMovementType;
    quantityChange: number;
    quantityBefore: number;
    quantityAfter: number;
    note: string | null;
    createdAt: string;

    user: {
        id: number;
        name: string;
    };
};

type InventoryHistory = {
    item: {
        id: number;
        name: string;
        unit: string;
        quantity: number;
        active: boolean;
    };

    movements: InventoryMovement[];
};

function getStatusLabel(status: InventoryStatus) {
    switch (status) {
        case "IN_STOCK":
            return "En stock";
        case "LOW_STOCK":
            return "Stock bajo";
        case "OUT_OF_STOCK":
            return "Agotado";
    }
}

function getStatusClasses(status: InventoryStatus) {
    switch (status) {
        case "IN_STOCK":
            return "bg-green-100 text-green-800";
        case "LOW_STOCK":
            return "bg-amber-100 text-amber-800";
        case "OUT_OF_STOCK":
            return "bg-red-100 text-red-800";
    }
}

function getMovementLabel(type: InventoryMovementType) {
    switch (type) {
        case "RESTOCK":
            return "📦 Reposición";
        case "USAGE":
            return "✂️ Uso";
        case "DAMAGED":
            return "⚠️ Dañado";
        case "CORRECTION":
            return "🔧 Corrección";
    }
}

function formatMovementDate(value: string) {
    return new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Bogota",
    }).format(new Date(value));
}

export default function InventoryPageClient() {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState("");

    const [search, setSearch] = useState("");
    const [filter, setFilter] =
        useState<FilterOption>("ALL");

    const [showShoppingList, setShowShoppingList] =
        useState(false);

    const [showCreateForm, setShowCreateForm] =
        useState(false);

    const [isSaving, setIsSaving] =
        useState(false);

    const [formError, setFormError] =
        useState("");

    const [name, setName] = useState("");
    const [category, setCategory] =
        useState("");
    const [unit, setUnit] =
        useState("unidad");

    const [quantity, setQuantity] =
        useState("0");

    const [
        lowStockThreshold,
        setLowStockThreshold,
    ] = useState("0");

    const [notes, setNotes] =
        useState("");

    // Stock-adjustment controls
    const [adjustingItem, setAdjustingItem] =
        useState<InventoryItem | null>(null);

    const [movementType, setMovementType] =
        useState<InventoryMovementType>("RESTOCK");

    const [adjustmentQuantity, setAdjustmentQuantity] =
        useState("1");

    const [adjustmentNote, setAdjustmentNote] =
        useState("");

    const [isAdjusting, setIsAdjusting] =
        useState(false);

    const [adjustmentError, setAdjustmentError] =
        useState("");

    // Inventory movement history.
    const [historyItem, setHistoryItem] =
        useState<InventoryItem | null>(null);

    const [inventoryHistory, setInventoryHistory] =
        useState<InventoryHistory | null>(null);

    const [isLoadingHistory, setIsLoadingHistory] =
        useState(false);

    const [historyError, setHistoryError] =
        useState("");
    
    // Product-detail editing. Quantity is intentionally excluded.
    const [editingItem, setEditingItem] =
        useState<InventoryItem | null>(null);

    const [editName, setEditName] =
        useState("");

    const [editCategory, setEditCategory] =
        useState("");

    const [editUnit, setEditUnit] =
        useState("");

    const [editLowStockThreshold, setEditLowStockThreshold] =
        useState("0");

    const [editNotes, setEditNotes] =
        useState("");

    const [editActive, setEditActive] =
        useState(true);

    const [isUpdatingItem, setIsUpdatingItem] =
        useState(false);

    const [editError, setEditError] =
        useState("");

    // Shopping-list restock quantities keyed by inventory item ID.
    const [shoppingQuantities, setShoppingQuantities] =
        useState<Record<number, string>>({});

    const [restockingItemId, setRestockingItemId] =
        useState<number | null>(null);

    const [shoppingError, setShoppingError] =
        useState("");

    const [categoryFilter, setCategoryFilter] =
        useState<"ALL" | InventoryCategory>("ALL");

    async function loadInventory(
        options?: {
            inactive?: boolean;
        }
    ) {
        try {
            setIsLoading(true);
            setLoadError("");

            const inactive =
                options?.inactive ?? false;

            const url = inactive
                ? "/api/inventory?status=inactive"
                : "/api/inventory";

            const response =
                await fetch(url);

            if (!response.ok) {
                throw new Error(
                    "No se pudo cargar el inventario"
                );
            }

            const data: InventoryItem[] =
                await response.json();

            setItems(data);
        } catch (error) {
            console.error(error);

            setLoadError(
                "No se pudo cargar el inventario."
            );
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadInventory();
    }, []);

    async function changeFilter(
        nextFilter: FilterOption
    ) {
        setFilter(nextFilter);
        setShowShoppingList(false);

        if (nextFilter === "INACTIVE") {
            await loadInventory({
                inactive: true,
            });
            return;
        }

        // If leaving the inactive view, restore active inventory.
        if (filter === "INACTIVE") {
            await loadInventory();
        }
    }

    const totalItems = items.length;

    const lowStockCount = items.filter(
        (item) =>
            item.status === "LOW_STOCK"
    ).length;

    const outOfStockCount = items.filter(
        (item) =>
            item.status === "OUT_OF_STOCK"
    ).length;

    const shoppingListItems = items.filter(
        (item) =>
            item.status === "LOW_STOCK" ||
            item.status === "OUT_OF_STOCK"
    );

    const filteredItems = useMemo(() => {
        const normalizedSearch =
            search.trim().toLowerCase();

        return items.filter((item) => {
            const matchesSearch =
                !normalizedSearch ||
                item.name
                    .toLowerCase()
                    .includes(
                        normalizedSearch
                    ) ||
                (
                    item.category ?? ""
                )
                    .toLowerCase()
                    .includes(
                        normalizedSearch
                    );

            const matchesCategory =
                categoryFilter === "ALL" ||
                item.category === categoryFilter;

            const matchesFilter =
                filter === "ALL" ||
                filter === "INACTIVE" ||
                item.status === filter;

            const matchesShoppingList =
                !showShoppingList ||
                item.status ===
                    "LOW_STOCK" ||
                item.status ===
                    "OUT_OF_STOCK";

            return (
                matchesSearch &&
                matchesCategory &&
                matchesFilter &&
                matchesShoppingList
            );
        });
    }, [
        items,
        search,
        categoryFilter,
        filter,
        showShoppingList,
    ]);

    async function createInventoryItem() {
        setFormError("");

        const parsedQuantity =
            Number(quantity);

        const parsedThreshold =
            Number(lowStockThreshold);

        if (!name.trim()) {
            setFormError(
                "Escribe el nombre del producto."
            );
            return;
        }

        if (
            !Number.isInteger(
                parsedQuantity
            ) ||
            parsedQuantity < 0
        ) {
            setFormError(
                "La cantidad debe ser un número entero mayor o igual a 0."
            );
            return;
        }

        if (
            !Number.isInteger(
                parsedThreshold
            ) ||
            parsedThreshold < 0
        ) {
            setFormError(
                "El mínimo de stock debe ser un número entero mayor o igual a 0."
            );
            return;
        }

        try {
            setIsSaving(true);

            const response =
                await fetch(
                    "/api/inventory",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify(
                            {
                                name:
                                    name.trim(),
                                category:
                                    category.trim() ||
                                    null,
                                unit:
                                    unit.trim() ||
                                    "unidad",
                                quantity:
                                    parsedQuantity,
                                lowStockThreshold:
                                    parsedThreshold,
                                notes:
                                    notes.trim() ||
                                    null,
                            }
                        ),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "No se pudo crear el producto"
                );
            }

            setName("");
            setCategory("");
            setUnit("unidad");
            setQuantity("0");
            setLowStockThreshold(
                "0"
            );
            setNotes("");
            setShowCreateForm(false);

            await loadInventory();
        } catch (error) {
            console.error(error);

            setFormError(
                error instanceof Error
                    ? error.message
                    : "No se pudo crear el producto."
            );
        } finally {
            setIsSaving(false);
        }
    }

    function openEditItem(item: InventoryItem) {
        setEditingItem(item);
        setEditName(item.name);
        setEditCategory(item.category ?? "");
        setEditUnit(item.unit);
        setEditLowStockThreshold(
            String(item.lowStockThreshold)
        );
        setEditNotes(item.notes ?? "");
        setEditActive(item.active);
        setEditError("");
    }

    async function updateInventoryItem() {
        if (!editingItem) {
            return;
        }

        setEditError("");

        const parsedThreshold =
            Number(editLowStockThreshold);

        if (!editName.trim()) {
            setEditError(
                "Escribe el nombre del producto."
            );
            return;
        }

        if (!editUnit.trim()) {
            setEditError(
                "Escribe la unidad del producto."
            );
            return;
        }

        if (
            !Number.isInteger(parsedThreshold) ||
            parsedThreshold < 0
        ) {
            setEditError(
                "El mínimo de stock debe ser un número entero mayor o igual a 0."
            );
            return;
        }

        try {
            setIsUpdatingItem(true);

            const response = await fetch(
                `/api/inventory/${editingItem.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        name: editName.trim(),
                        category:
                            editCategory.trim() ||
                            null,
                        unit: editUnit.trim(),
                        lowStockThreshold:
                            parsedThreshold,
                        notes:
                            editNotes.trim() ||
                            null,
                        active: editActive,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "No se pudo actualizar el producto."
                );
            }

            setEditingItem(null);
            setEditError("");

            if (filter === "INACTIVE") {
                await loadInventory({
                    inactive: true,
                });
            } else {
                await loadInventory();
            }
        } catch (error) {
            console.error(error);

            setEditError(
                error instanceof Error
                    ? error.message
                    : "No se pudo actualizar el producto."
            );
        } finally {
            setIsUpdatingItem(false);
        }
    }

    async function loadMovementHistory(item: InventoryItem) {
        try {
            setHistoryItem(item);
            setInventoryHistory(null);
            setHistoryError("");
            setIsLoadingHistory(true);

            const response = await fetch(
                `/api/inventory/${item.id}/movements`
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "No se pudo cargar el historial."
                );
            }

            setInventoryHistory(data);
        } catch (error) {
            console.error(error);

            setHistoryError(
                error instanceof Error
                    ? error.message
                    : "No se pudo cargar el historial."
            );
        } finally {
            setIsLoadingHistory(false);
        }
    }

    async function restockFromShoppingList(
        item: InventoryItem
    ) {
        setShoppingError("");

        const rawQuantity =
            shoppingQuantities[item.id] ?? "1";

        const parsedQuantity =
            Number(rawQuantity);

        if (
            !Number.isInteger(parsedQuantity) ||
            parsedQuantity <= 0
        ) {
            setShoppingError(
                "La cantidad a reponer debe ser un número entero mayor a 0."
            );
            return;
        }

        try {
            setRestockingItemId(item.id);

            const response = await fetch(
                `/api/inventory/${item.id}/adjust`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        type: "RESTOCK",
                        quantity: parsedQuantity,
                        note:
                            "Reposición desde lista de compras",
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "No se pudo registrar la reposición."
                );
            }

            setShoppingQuantities((current) => {
                const next = { ...current };
                delete next[item.id];
                return next;
            });

            await loadInventory();
        } catch (error) {
            console.error(error);

            setShoppingError(
                error instanceof Error
                    ? error.message
                    : "No se pudo registrar la reposición."
            );
        } finally {
            setRestockingItemId(null);
        }
    }

    async function adjustInventory() {
        if (!adjustingItem) {
            return;
        }

        setAdjustmentError("");

        const parsedQuantity =
            Number(adjustmentQuantity);

        if (
            !Number.isInteger(parsedQuantity) ||
            parsedQuantity === 0
        ) {
            setAdjustmentError(
                "La cantidad debe ser un número entero diferente de 0."
            );
            return;
        }

        // Normal stock additions/removals use a positive quantity.
        // Corrections may intentionally use + or - values.
        if (
            movementType !== "CORRECTION" &&
            parsedQuantity < 0
        ) {
            setAdjustmentError(
                "Usa una cantidad positiva para este tipo de movimiento."
            );
            return;
        }

        try {
            setIsAdjusting(true);

            const response = await fetch(
                `/api/inventory/${adjustingItem.id}/adjust`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        type: movementType,
                        quantity: parsedQuantity,
                        note:
                            adjustmentNote.trim() ||
                            null,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                if (
                    response.status === 409
                ) {
                    throw new Error(
                        "No hay suficiente inventario para realizar este ajuste."
                    );
                }

                throw new Error(
                    data.error ||
                        "No se pudo ajustar el inventario."
                );
            }

            setAdjustingItem(null);
            setMovementType("RESTOCK");
            setAdjustmentQuantity("1");
            setAdjustmentNote("");
            setAdjustmentError("");

            await loadInventory();
        } catch (error) {
            console.error(error);

            setAdjustmentError(
                error instanceof Error
                    ? error.message
                    : "No se pudo ajustar el inventario."
            );
        } finally {
            setIsAdjusting(false);
        }
    }

    return (
        <div className="mt-8">
            {/* Inventory summary */}
            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-neutral-500">
                        Productos
                    </p>

                    <p className="mt-2 text-3xl font-bold text-black">
                        {totalItems}
                    </p>

                    <p className="mt-1 text-sm text-neutral-500">
                        En inventario
                    </p>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-neutral-500">
                        Stock bajo
                    </p>

                    <p className="mt-2 text-3xl font-bold text-amber-700">
                        {lowStockCount}
                    </p>

                    <p className="mt-1 text-sm text-neutral-500">
                        Necesitan reposición
                    </p>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-neutral-500">
                        Agotados
                    </p>

                    <p className="mt-2 text-3xl font-bold text-red-700">
                        {outOfStockCount}
                    </p>

                    <p className="mt-1 text-sm text-neutral-500">
                        Sin stock
                    </p>
                </div>
            </div>

            {/* Main actions */}
            <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <input
                    type="search"
                    value={search}
                    onChange={(event) =>
                        setSearch(
                            event.target.value
                        )
                    }
                    placeholder="Buscar producto..."
                    className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black lg:max-w-md"
                />

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            setShowCreateForm(
                                (current) =>
                                    !current
                            )
                        }
                        className="rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                        + Agregar producto
                    </button>

                    <button
                        type="button"
                        onClick={async () => {
                            // Shopping list always uses active inventory.
                            if (filter === "INACTIVE") {
                                setFilter("ALL");
                                await loadInventory();
                            }

                            setShoppingError("");

                            setShowShoppingList(
                                (current) => !current
                            );
                        }}
                        className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-neutral-100"
                    >
                        🛒{" "}
                        {showShoppingList
                            ? "Ver inventario"
                            : `Lista de compras (${shoppingListItems.length})`}
                    </button>
                </div>
            </div>

            {/* Create inventory item */}
            {showCreateForm && (
                <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-black">
                                Agregar producto
                            </h2>

                            <p className="mt-1 text-sm text-neutral-500">
                                Registra un nuevo producto o insumo del salón.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setShowCreateForm(
                                    false
                                );
                                setFormError("");
                            }}
                            className="text-sm font-semibold text-neutral-500 hover:text-black"
                        >
                            Cerrar
                        </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Producto
                            </label>

                            <input
                                type="text"
                                value={name}
                                onChange={(
                                    event
                                ) =>
                                    setName(
                                        event.target
                                            .value
                                    )
                                }
                                placeholder="Ej. Base Rubber"
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Categoría
                            </label>

                            <select
                                value={category}
                                onChange={(event) =>
                                    setCategory(event.target.value)
                                }
                                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                            >
                                <option value="">
                                    Selecciona una categoría
                                </option>

                                {INVENTORY_CATEGORIES.map(
                                    (inventoryCategory) => (
                                        <option
                                            key={inventoryCategory}
                                            value={inventoryCategory}
                                        >
                                            {inventoryCategory}
                                        </option>
                                    )
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Unidad
                            </label>

                            <input
                                type="text"
                                value={unit}
                                onChange={(
                                    event
                                ) =>
                                    setUnit(
                                        event.target
                                            .value
                                    )
                                }
                                placeholder="unidad, botella, caja..."
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Cantidad inicial
                            </label>

                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={quantity}
                                onFocus={(
                                    event
                                ) =>
                                    event.currentTarget.select()
                                }
                                onChange={(
                                    event
                                ) =>
                                    setQuantity(
                                        event.target
                                            .value
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Mínimo de stock
                            </label>

                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={
                                    lowStockThreshold
                                }
                                onFocus={(
                                    event
                                ) =>
                                    event.currentTarget.select()
                                }
                                onChange={(
                                    event
                                ) =>
                                    setLowStockThreshold(
                                        event.target
                                            .value
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-black">
                                Notas
                            </label>

                            <textarea
                                value={notes}
                                onChange={(
                                    event
                                ) =>
                                    setNotes(
                                        event.target
                                            .value
                                    )
                                }
                                placeholder="Marca, tamaño, proveedor, presentación..."
                                rows={3}
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>
                    </div>

                    {formError && (
                        <p className="mt-4 text-sm font-medium text-red-700">
                            {formError}
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={
                            createInventoryItem
                        }
                        disabled={isSaving}
                        className="mt-5 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {isSaving
                            ? "Guardando..."
                            : "Guardar producto"}
                    </button>
                </div>
            )}

            {/* Category filter */}
            <div className="mt-6">
                <label
                    htmlFor="inventory-category-filter"
                    className="block text-sm font-semibold text-black"
                >
                    Categoría
                </label>

                <select
                    id="inventory-category-filter"
                    value={categoryFilter}
                    onChange={(event) =>
                        setCategoryFilter(
                            event.target.value as
                                | "ALL"
                                | InventoryCategory
                        )
                    }
                    className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black sm:max-w-xs"
                >
                    <option value="ALL">
                        Todas las categorías
                    </option>

                    {INVENTORY_CATEGORIES.map(
                        (inventoryCategory) => (
                            <option
                                key={inventoryCategory}
                                value={inventoryCategory}
                            >
                                {inventoryCategory}
                            </option>
                        )
                    )}
                </select>
            </div>

{/* Filters */}

            {/* Filters */}
            <div className="mt-6 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() =>
                        changeFilter("ALL")
                    }
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        filter === "ALL"
                            ? "bg-black text-white"
                            : "bg-white text-black"
                    }`}
                >
                    Todos ({totalItems})
                </button>

                <button
                    type="button"
                    onClick={() =>
                        changeFilter(
                            "LOW_STOCK"
                        )
                    }
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        filter ===
                        "LOW_STOCK"
                            ? "bg-black text-white"
                            : "bg-white text-black"
                    }`}
                >
                    Stock bajo (
                    {lowStockCount})
                </button>

                <button
                    type="button"
                    onClick={() =>
                        changeFilter(
                            "OUT_OF_STOCK"
                        )
                    }
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        filter ===
                        "OUT_OF_STOCK"
                            ? "bg-black text-white"
                            : "bg-white text-black"
                    }`}
                >
                    Agotados (
                    {outOfStockCount})
                </button>

                <button
                    type="button"
                    onClick={() =>
                        changeFilter("INACTIVE")
                    }
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                        filter === "INACTIVE"
                            ? "bg-black text-white"
                            : "bg-white text-black"
                    }`}
                >
                    Inactivos
                </button>
            </div>

            {/* Inventory list */}
            <div className="mt-6">
                {isLoading && (
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-neutral-500">
                            Cargando inventario...
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
                            onClick={() =>
                                loadInventory({
                                    inactive:
                                        filter === "INACTIVE",
                                })
                            }
                            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {!isLoading &&
                    !loadError &&
                    filteredItems.length ===
                        0 && (
                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-neutral-500">
                                {showShoppingList
                                    ? "No hay productos pendientes por reponer."
                                    : "No se encontraron productos."}
                            </p>
                        </div>
                    )}

                {!isLoading &&
                    !loadError &&
                    filteredItems.length >
                        0 && (
                        <div className="grid gap-4 lg:grid-cols-2">
                            {filteredItems.map(
                                (item) => (
                                    <div
                                        key={
                                            item.id
                                        }
                                        className="rounded-xl bg-white p-5 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-lg font-bold text-black">
                                                    {
                                                        item.name
                                                    }
                                                </p>

                                                {item.category && (
                                                    <p className="mt-1 text-sm text-neutral-500">
                                                        {
                                                            item.category
                                                        }
                                                    </p>
                                                )}
                                            </div>

                                            {item.active ? (
                                                <span
                                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                                        item.status
                                                    )}`}
                                                >
                                                    {getStatusLabel(
                                                        item.status
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="rounded-full bg-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-700">
                                                    Inactivo
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-4 flex items-end justify-between gap-4">
                                            <div>
                                                <p className="text-sm text-neutral-500">
                                                    Stock
                                                </p>

                                                <p className="mt-1 text-2xl font-bold text-black">
                                                    {
                                                        item.quantity
                                                    }{" "}
                                                    <span className="text-sm font-medium text-neutral-500">
                                                        {
                                                            item.unit
                                                        }
                                                    </span>
                                                </p>

                                                <p className="mt-1 text-xs text-neutral-400">
                                                    Mínimo:{" "}
                                                    {
                                                        item.lowStockThreshold
                                                    }{" "}
                                                    {
                                                        item.unit
                                                    }
                                                </p>

                                                {showShoppingList && (
                                                    <div className="mt-4 rounded-xl bg-neutral-50 p-4">
                                                        <label className="block text-sm font-semibold text-black">
                                                            Cantidad a comprar
                                                        </label>

                                                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                step="1"
                                                                value={
                                                                    shoppingQuantities[item.id] ??
                                                                    ""
                                                                }
                                                                onFocus={(event) =>
                                                                    event.currentTarget.select()
                                                                }
                                                                onChange={(event) =>
                                                                    setShoppingQuantities(
                                                                        (current) => ({
                                                                            ...current,
                                                                            [item.id]:
                                                                                event.target.value,
                                                                        })
                                                                    )
                                                                }
                                                                placeholder="Cantidad"
                                                                className="w-full rounded-lg border border-neutral-300 bg-white px-4 py-2 text-black sm:max-w-36"
                                                            />

                                                            <button
                                                                type="button"
                                                                disabled={
                                                                    restockingItemId === item.id
                                                                }
                                                                onClick={() =>
                                                                    restockFromShoppingList(item)
                                                                }
                                                                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                                            >
                                                                {restockingItemId === item.id
                                                                    ? "Guardando..."
                                                                    : "Registrar reposición"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                </div>

                                            <div className="flex flex-wrap justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        openEditItem(item)
                                                    }
                                                    className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                                                >
                                                    Editar producto
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        loadMovementHistory(item)
                                                    }
                                                    className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                                                >
                                                    Ver historial
                                                </button>

                                                {item.active && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAdjustingItem(item);
                                                            setMovementType("RESTOCK");
                                                            setAdjustmentQuantity("1");
                                                            setAdjustmentNote("");
                                                            setAdjustmentError("");
                                                        }}
                                                        className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                                                    >
                                                        Ajustar stock
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        {item.notes && (
                                            <p className="mt-4 border-t border-neutral-200 pt-4 text-sm text-neutral-500">
                                                {
                                                    item.notes
                                                }
                                            </p>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    )}
            </div>

            {shoppingError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-700">
                        {shoppingError}
                    </p>
                </div>
            )}

            {/* Product editing panel */}
            {editingItem && (
                <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-black">
                                Editar producto
                            </h2>

                            <p className="mt-1 text-sm text-neutral-500">
                                Actualiza la información del producto sin modificar su stock.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setEditingItem(null);
                                setEditError("");
                            }}
                            className="text-sm font-semibold text-neutral-500 hover:text-black"
                        >
                            Cerrar
                        </button>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Producto
                            </label>

                            <input
                                type="text"
                                value={editName}
                                onChange={(event) =>
                                    setEditName(
                                        event.target.value
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Categoría
                            </label>

                             <select
                                value={editCategory}
                                onChange={(event) =>
                                    setEditCategory(
                                        event.target.value
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                            >
                                <option value="">
                                    Sin categoría
                                </option>

                                {editCategory &&
                                    !INVENTORY_CATEGORIES.includes(
                                        editCategory as InventoryCategory
                                    ) && (
                                        <option value={editCategory}>
                                            {editCategory} (actual)
                                        </option>
                                    )}

                                {INVENTORY_CATEGORIES.map(
                                    (inventoryCategory) => (
                                        <option
                                            key={inventoryCategory}
                                            value={inventoryCategory}
                                        >
                                            {inventoryCategory}
                                        </option>
                                    )
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Unidad
                            </label>

                            <input
                                type="text"
                                value={editUnit}
                                onChange={(event) =>
                                    setEditUnit(
                                        event.target.value
                                    )
                                }
                                placeholder="unidad, botella, caja..."
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Mínimo de stock
                            </label>

                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={editLowStockThreshold}
                                onFocus={(event) =>
                                    event.currentTarget.select()
                                }
                                onChange={(event) =>
                                    setEditLowStockThreshold(
                                        event.target.value
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-black">
                                Notas
                            </label>

                            <textarea
                                value={editNotes}
                                onChange={(event) =>
                                    setEditNotes(
                                        event.target.value
                                    )
                                }
                                rows={3}
                                placeholder="Marca, tamaño, proveedor, presentación..."
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>
                    </div>

                    <div className="mt-5 rounded-xl border border-neutral-200 p-4">
                        <label className="flex cursor-pointer items-center justify-between gap-4">
                            <div>
                                <p className="font-semibold text-black">
                                    Producto activo
                                </p>

                                <p className="mt-1 text-sm text-neutral-500">
                                    Los productos inactivos dejan de aparecer en el inventario operativo.
                                </p>
                            </div>

                            <input
                                type="checkbox"
                                checked={editActive}
                                onChange={(event) =>
                                    setEditActive(
                                        event.target.checked
                                    )
                                }
                                className="h-5 w-5"
                            />
                        </label>
                    </div>

                    <div className="mt-5 rounded-xl bg-neutral-50 p-4">
                        <p className="text-sm font-semibold text-black">
                            Stock actual
                        </p>

                        <p className="mt-1 text-lg font-bold text-black">
                            {editingItem.quantity}{" "}
                            {editingItem.unit}
                        </p>

                        <p className="mt-1 text-xs text-neutral-500">
                            Para cambiar esta cantidad usa “Ajustar stock” para conservar el historial.
                        </p>
                    </div>

                    {editError && (
                        <p className="mt-4 text-sm font-medium text-red-700">
                            {editError}
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={updateInventoryItem}
                        disabled={isUpdatingItem}
                        className="mt-5 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {isUpdatingItem
                            ? "Guardando..."
                            : "Guardar cambios"}
                    </button>
                </div>
            )}

            {/* Stock adjustment panel */}
            {adjustingItem && (
                <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-black">
                                Ajustar stock
                            </h2>

                            <p className="mt-1 font-semibold text-black">
                                {adjustingItem.name}
                            </p>

                            <p className="mt-1 text-sm text-neutral-500">
                                Stock actual:{" "}
                                {adjustingItem.quantity}{" "}
                                {adjustingItem.unit}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setAdjustingItem(null);
                                setAdjustmentError("");
                            }}
                            className="text-sm font-semibold text-neutral-500 hover:text-black"
                        >
                            Cerrar
                        </button>
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            {
                                value: "RESTOCK",
                                label: "📦 Reposición",
                            },
                            {
                                value: "USAGE",
                                label: "✂️ Uso",
                            },
                            {
                                value: "DAMAGED",
                                label: "⚠️ Dañado",
                            },
                            {
                                value: "CORRECTION",
                                label: "🔧 Corrección",
                            },
                        ].map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                    setMovementType(
                                        option.value as InventoryMovementType
                                    )
                                }
                                className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                                    movementType === option.value
                                        ? "border-black bg-black text-white"
                                        : "border-neutral-300 bg-white text-black hover:bg-neutral-100"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Cantidad
                            </label>

                            <input
                                type="number"
                                step="1"
                                min={
                                    movementType ===
                                    "CORRECTION"
                                        ? undefined
                                        : "1"
                                }
                                value={adjustmentQuantity}
                                onFocus={(event) =>
                                    event.currentTarget.select()
                                }
                                onChange={(event) =>
                                    setAdjustmentQuantity(
                                        event.target.value
                                    )
                                }
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />

                            <p className="mt-2 text-xs text-neutral-500">
                                {movementType === "RESTOCK" &&
                                    "Cantidad recibida para agregar al inventario."}

                                {movementType === "USAGE" &&
                                    "Cantidad utilizada del producto."}

                                {movementType === "DAMAGED" &&
                                    "Cantidad dañada, perdida o descartada."}

                                {movementType === "CORRECTION" &&
                                    "Usa un número positivo para agregar o negativo para reducir."}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-black">
                                Nota
                            </label>

                            <input
                                type="text"
                                value={adjustmentNote}
                                onChange={(event) =>
                                    setAdjustmentNote(
                                        event.target.value
                                    )
                                }
                                placeholder="Opcional"
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
                        </div>
                    </div>

                    {adjustmentError && (
                        <p className="mt-4 text-sm font-medium text-red-700">
                            {adjustmentError}
                        </p>
                    )}

                    <button
                        type="button"
                        onClick={adjustInventory}
                        disabled={isAdjusting}
                        className="mt-5 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {isAdjusting
                            ? "Guardando..."
                            : "Guardar ajuste"}
                    </button>
                </div>
            )}

            {/* Inventory movement history */}
            {historyItem && (
                <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-black">
                                Historial de inventario
                            </h2>

                            <p className="mt-1 font-semibold text-black">
                                {historyItem.name}
                            </p>

                            <p className="mt-1 text-sm text-neutral-500">
                                Stock actual: {historyItem.quantity}{" "}
                                {historyItem.unit}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => {
                                setHistoryItem(null);
                                setInventoryHistory(null);
                                setHistoryError("");
                            }}
                            className="text-sm font-semibold text-neutral-500 hover:text-black"
                        >
                            Cerrar
                        </button>
                    </div>

                    {isLoadingHistory && (
                        <p className="mt-5 text-sm text-neutral-500">
                            Cargando historial...
                        </p>
                    )}

                    {historyError && (
                        <div className="mt-5">
                            <p className="text-sm font-medium text-red-700">
                                {historyError}
                            </p>

                            <button
                                type="button"
                                onClick={() =>
                                    loadMovementHistory(historyItem)
                                }
                                className="mt-3 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                            >
                                Reintentar
                            </button>
                        </div>
                    )}

                    {!isLoadingHistory &&
                        !historyError &&
                        inventoryHistory &&
                        inventoryHistory.movements.length === 0 && (
                            <p className="mt-5 text-sm text-neutral-500">
                                Este producto todavía no tiene movimientos registrados.
                            </p>
                        )}

                    {!isLoadingHistory &&
                        !historyError &&
                        inventoryHistory &&
                        inventoryHistory.movements.length > 0 && (
                            <div className="mt-5 space-y-3">
                                {inventoryHistory.movements.map(
                                    (movement) => (
                                        <div
                                            key={movement.id}
                                            className="rounded-xl border border-neutral-200 p-4"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <p className="font-bold text-black">
                                                        {getMovementLabel(
                                                            movement.type
                                                        )}
                                                    </p>

                                                    <p className="mt-1 text-sm text-neutral-600">
                                                        {movement.quantityBefore}
                                                        {" → "}
                                                        {movement.quantityAfter}{" "}
                                                        {historyItem.unit}
                                                    </p>

                                                    <p className="mt-1 text-sm text-neutral-500">
                                                        Por:{" "}
                                                        {movement.user.name}
                                                    </p>

                                                    {movement.note && (
                                                        <p className="mt-2 text-sm text-neutral-500">
                                                            Nota:{" "}
                                                            {movement.note}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="sm:text-right">
                                                    <p
                                                        className={`text-lg font-bold ${
                                                            movement.quantityChange > 0
                                                                ? "text-green-700"
                                                                : movement.quantityChange < 0
                                                                ? "text-red-700"
                                                                : "text-black"
                                                        }`}
                                                    >
                                                        {movement.quantityChange > 0
                                                            ? "+"
                                                            : ""}
                                                        {
                                                            movement.quantityChange
                                                        }
                                                    </p>

                                                    <p className="mt-1 text-xs text-neutral-500">
                                                        {formatMovementDate(
                                                            movement.createdAt
                                                        )}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                </div>
            )}

            {/* Shopping-list reminder */}
            {shoppingListItems.length > 0 && (
                <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="font-bold text-black">
                                🛒{" "}
                                {
                                    shoppingListItems.length
                                }{" "}
                                {shoppingListItems.length ===
                                1
                                    ? "producto necesita reposición"
                                    : "productos necesitan reposición"}
                            </p>

                            <p className="mt-1 text-sm text-neutral-600">
                                Revisa la lista de compras para mantener el inventario al día.
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                setShowShoppingList(
                                    true
                                )
                            }
                            className="rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white"
                        >
                            Ver lista de compras
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}