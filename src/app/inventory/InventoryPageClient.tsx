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
    | "OUT_OF_STOCK";

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

    async function loadInventory() {
        try {
            setIsLoading(true);
            setLoadError("");

            const response =
                await fetch("/api/inventory");

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

            const matchesFilter =
                filter === "ALL" ||
                item.status === filter;

            const matchesShoppingList =
                !showShoppingList ||
                item.status ===
                    "LOW_STOCK" ||
                item.status ===
                    "OUT_OF_STOCK";

            return (
                matchesSearch &&
                matchesFilter &&
                matchesShoppingList
            );
        });
    }, [
        items,
        search,
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
                        onClick={() =>
                            setShowShoppingList(
                                (current) =>
                                    !current
                            )
                        }
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

                            <input
                                type="text"
                                value={category}
                                onChange={(
                                    event
                                ) =>
                                    setCategory(
                                        event.target
                                            .value
                                    )
                                }
                                placeholder="Ej. Uñas"
                                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-black"
                            />
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

            {/* Filters */}
            <div className="mt-6 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() =>
                        setFilter("ALL")
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
                        setFilter(
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
                        setFilter(
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
                            onClick={
                                loadInventory
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

                                            <span
                                                className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusClasses(
                                                    item.status
                                                )}`}
                                            >
                                                {getStatusLabel(
                                                    item.status
                                                )}
                                            </span>
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
                                            </div>

                                            <button
                                                type="button"
                                                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                                            >
                                                Ajustar stock
                                            </button>
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