"use client";

import { useSearchParams } from "next/navigation";
import {
    useEffect,
    useMemo,
    useState,
} from "react";

type SaleLineItem = {
    id: number;
    itemType: string;
    itemId: number | null;
    itemName: string;
    unitPrice: number;
};

type Payment = {
    id: number;
    paymentMethod: string;
    amount: number;
    processingFee: number;
};

type Employee = {
    id: number;
    name: string;
};

type Commission = {
    id: number;
    employeeId: number;
    commissionBase: number;
    commissionRate: number;
    commissionAmount: number;
    status: string;
    paidAt: string | null;
    employee: Employee;
};

type Tip = {
    id: number;
    employeeId: number;
    amount: number;
    paymentMethod: string;
    status: string;
    paidAt: string | null;
    employee: Employee;
};

type SaleAppointment = {
    appointment: {
        id: number;
        date: string;
        startTime: string;
        customer: {
            id: number;
            name: string;
            phone: string | null;
        };
        employee: Employee;
    };
};

type Sale = {
    id: number;
    subtotal: number;
    discountTotal: number;
    finalTotal: number;
    createdAt: string;
    lineItems: SaleLineItem[];
    payments: Payment[];
    commissions: Commission[];
    tips: Tip[];
    saleAppointments: SaleAppointment[];
};

type DateRangeOption =
    | "TODAY"
    | "WEEK"
    | "MONTH"
    | "CUSTOM";

function formatCOP(value: number) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
    }).format(value);
}

function formatSaleTime(value: string) {
    return new Intl.DateTimeFormat("es-CO", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Bogota",
    }).format(new Date(value));
}

function formatSaleDateTime(value: string) {
    return new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/Bogota",
    }).format(new Date(value));
}

function getPaymentLabel(method: string) {
    switch (method) {
        case "CASH":
            return "Efectivo";
        case "TRANSFER":
            return "Transferencia";
        case "BOLD":
            return "Bold";
        default:
            return method;
    }
}

function getStatusLabel(status: string) {
    switch (status) {
        case "PAID":
            return "Pagada";
        case "PENDING":
            return "Pendiente";
        default:
            return status;
    }
}

function getBogotaDateString(
    date = new Date()
) {
    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "America/Bogota",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }
    ).format(date);
}

function addDays(
    dateString: string,
    days: number
) {
    const [year, month, day] =
        dateString
            .split("-")
            .map(Number);

    const date = new Date(
        Date.UTC(year, month - 1, day)
    );

    date.setUTCDate(
        date.getUTCDate() + days
    );

    return date
        .toISOString()
        .slice(0, 10);
}

export default function SalesPageClient() {
    const today =
        getBogotaDateString();

    const searchParams = useSearchParams();

    const requestedSaleId =
        searchParams.get("saleId");

    const [dateRange, setDateRange] =
        useState<DateRangeOption>("TODAY");

    const [customFrom, setCustomFrom] =
        useState(today);

    const [customTo, setCustomTo] =
        useState(today);

    const [sales, setSales] =
        useState<Sale[]>([]);

    const [isLoading, setIsLoading] =
        useState(true);

    const [loadError, setLoadError] =
        useState("");

    const [search, setSearch] =
        useState("");

    const [employeeFilter, setEmployeeFilter] =
        useState("ALL");

    const [paymentFilter, setPaymentFilter] =
        useState("ALL");

    const [selectedSale, setSelectedSale] =
        useState<Sale | null>(null);

    function getSelectedRange() {
        const [year, month, day] =
            today.split("-").map(Number);

        const todayDate = new Date(
            Date.UTC(year, month - 1, day)
        );

        if (dateRange === "TODAY") {
            return {
                from: today,
                to: addDays(today, 1),
            };
        }

        if (dateRange === "WEEK") {
            const dayOfWeek =
                todayDate.getUTCDay();

            // Monday = beginning of TEFF week.
            const daysSinceMonday =
                dayOfWeek === 0
                    ? 6
                    : dayOfWeek - 1;

            const monday =
                addDays(
                    today,
                    -daysSinceMonday
                );

            return {
                from: monday,
                to: addDays(today, 1),
            };
        }

        if (dateRange === "MONTH") {
            const firstDay =
                `${year}-${String(
                    month
                ).padStart(2, "0")}-01`;

            return {
                from: firstDay,
                to: addDays(today, 1),
            };
        }

        return {
            from: customFrom,
            to: addDays(customTo, 1),
        };
    }

    async function loadSales() {
        try {
            setIsLoading(true);
            setLoadError("");

            const { from, to } =
                getSelectedRange();

            const response = await fetch(
                `/api/sales?from=${from}&to=${to}`
            );

            if (!response.ok) {
                throw new Error(
                    "No se pudo cargar el historial de ventas."
                );
            }

            const data: Sale[] =
                await response.json();

            setSales(data);
        } catch (error) {
            console.error(error);

            setLoadError(
                "No se pudo cargar el historial de ventas."
            );
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadSales();
    }, [
        dateRange,
        customFrom,
        customTo,
    ]);

    useEffect(() => {
        if (!requestedSaleId) {
            return;
        }

        const saleId = Number(requestedSaleId);

        if (
            !Number.isSafeInteger(saleId) ||
            saleId <= 0
        ) {
            return;
        }

        let cancelled = false;

        async function loadSelectedSale() {
            try {
                const response = await fetch(
                    `/api/sales/${saleId}`
                );

                if (!response.ok) {
                    throw new Error(
                        "No se pudo cargar la venta."
                    );
                }

                const sale: Sale =
                    await response.json();

                if (!cancelled) {
                    setSelectedSale(sale);
                }
            } catch (error) {
                console.error(
                    "Failed to open selected sale:",
                    error
                );
            }
        }

        void loadSelectedSale();

        return () => {
            cancelled = true;
        };
    }, [requestedSaleId]);

    const employees = useMemo(() => {
        const employeeMap =
            new Map<number, string>();

        sales.forEach((sale) => {
            sale.saleAppointments.forEach(
                (item) => {
                    employeeMap.set(
                        item.appointment.employee.id,
                        item.appointment.employee.name
                    );
                }
            );
        });

        return Array.from(
            employeeMap.entries()
        )
            .map(([id, name]) => ({
                id,
                name,
            }))
            .sort((a, b) =>
                a.name.localeCompare(
                    b.name,
                    "es"
                )
            );
    }, [sales]);

    const paymentMethods = useMemo(() => {
        return [
            ...new Set(
                sales.flatMap((sale) =>
                    sale.payments.map(
                        (payment) =>
                            payment.paymentMethod
                    )
                )
            ),
        ].sort();
    }, [sales]);

    const filteredSales = useMemo(() => {
        const normalized =
            search.trim().toLowerCase();

        return sales.filter((sale) => {
            const customers =
                sale.saleAppointments.map(
                    (item) =>
                        item.appointment.customer.name
                );

            const saleEmployees =
                sale.saleAppointments.map(
                    (item) =>
                        item.appointment.employee.name
                );

            const matchesSearch =
                !normalized ||
                [
                    ...customers,
                    ...saleEmployees,
                    String(sale.id),
                ].some((value) =>
                    value
                        .toLowerCase()
                        .includes(normalized)
                );

            const matchesEmployee =
                employeeFilter === "ALL" ||
                sale.saleAppointments.some(
                    (item) =>
                        String(
                            item.appointment.employee.id
                        ) === employeeFilter
                );

            const matchesPayment =
                paymentFilter === "ALL" ||
                sale.payments.some(
                    (payment) =>
                        payment.paymentMethod ===
                        paymentFilter
                );

            return (
                matchesSearch &&
                matchesEmployee &&
                matchesPayment
            );
        });
    }, [
        sales,
        search,
        employeeFilter,
        paymentFilter,
    ]);

    const totalSales =
        sales.reduce(
            (sum, sale) =>
                sum + sale.finalTotal,
            0
        );

    const uniqueCustomers =
        new Set(
            sales.flatMap((sale) =>
                sale.saleAppointments.map(
                    (item) =>
                        item.appointment.customer.id
                )
            )
    ).size;

    function getSalesSummaryLabel() {
        switch (dateRange) {
            case "TODAY":
                return "Ventas de Hoy";

            case "WEEK":
                return "Ventas de Esta Semana";

            case "MONTH":
                return "Ventas de Este Mes";

            case "CUSTOM":
                return "Ventas del Rango";
        }
    }

    return (
        <div className="mt-8">
            <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm text-neutral-500">
                        {getSalesSummaryLabel()}
                    </p>

                    <p className="mt-2 text-3xl font-bold text-black">
                        {formatCOP(
                            totalSales
                        )}
                    </p>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm text-neutral-500">
                        Transacciones
                    </p>

                    <p className="mt-2 text-3xl font-bold text-black">
                        {sales.length}
                    </p>
                </div>

                <div className="rounded-xl bg-white p-5 shadow-sm">
                    <p className="text-sm text-neutral-500">
                        Clientes
                    </p>

                    <p className="mt-2 text-3xl font-bold text-black">
                        {uniqueCustomers}
                    </p>
                </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
                {[
                    {
                        value: "TODAY",
                        label: "Hoy",
                    },
                    {
                        value: "WEEK",
                        label: "Esta semana",
                    },
                    {
                        value: "MONTH",
                        label: "Este mes",
                    },
                    {
                        value: "CUSTOM",
                        label: "Rango",
                    },
                ].map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                            setDateRange(
                                option.value as DateRangeOption
                            )
                        }
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            dateRange ===
                            option.value
                                ? "bg-black text-white"
                                : "bg-white text-black"
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {dateRange === "CUSTOM" && (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="block text-sm font-semibold text-black">
                            Desde
                        </label>

                        <input
                            type="date"
                            value={customFrom}
                            onChange={(event) =>
                                setCustomFrom(
                                    event.target.value
                                )
                            }
                            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-black">
                            Hasta
                        </label>

                        <input
                            type="date"
                            value={customTo}
                            onChange={(event) =>
                                setCustomTo(
                                    event.target.value
                                )
                            }
                            className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                        />
                    </div>
                </div>
            )}

            <div className="mt-6">
                <input
                    type="search"
                    value={search}
                    onChange={(event) =>
                        setSearch(
                            event.target.value
                        )
                    }
                    placeholder="Buscar cliente, técnica o venta..."
                    className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black lg:max-w-md"
                />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                    <label className="block text-sm font-semibold text-black">
                        Técnica
                    </label>

                    <select
                        value={employeeFilter}
                        onChange={(event) =>
                            setEmployeeFilter(
                                event.target.value
                            )
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                    >
                        <option value="ALL">
                            Todas las técnicas
                        </option>

                        {employees.map((employee) => (
                            <option
                                key={employee.id}
                                value={employee.id}
                            >
                                {employee.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-black">
                        Método de pago
                    </label>

                    <select
                        value={paymentFilter}
                        onChange={(event) =>
                            setPaymentFilter(
                                event.target.value
                            )
                        }
                        className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                    >
                        <option value="ALL">
                            Todos los métodos
                        </option>

                        {paymentMethods.map(
                            (method) => (
                                <option
                                    key={method}
                                    value={method}
                                >
                                    {method}
                                </option>
                            )
                        )}
                    </select>
                </div>
            </div>

            <div className="mt-6">
                {isLoading && (
                    <div className="rounded-xl bg-white p-5 shadow-sm">
                        <p className="text-neutral-500">
                            Cargando ventas...
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
                                loadSales
                            }
                            className="mt-4 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white"
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {!isLoading &&
                    !loadError &&
                    filteredSales.length ===
                        0 && (
                        <div className="rounded-xl bg-white p-5 shadow-sm">
                            <p className="text-neutral-500">
                                No hay ventas para el período seleccionado.
                            </p>
                        </div>
                    )}

                {!isLoading &&
                    !loadError &&
                    filteredSales.length >
                        0 && (
                        <div className="space-y-3">
                            {filteredSales.map(
                                (sale) => {
                                    const customerNames =
                                        [
                                            ...new Set(
                                                sale.saleAppointments.map(
                                                    (
                                                        item
                                                    ) =>
                                                        item
                                                            .appointment
                                                            .customer
                                                            .name
                                                )
                                            ),
                                        ];

                                    const employeeNames =
                                        [
                                            ...new Set(
                                                sale.saleAppointments.map(
                                                    (
                                                        item
                                                    ) =>
                                                        item
                                                            .appointment
                                                            .employee
                                                            .name
                                                )
                                            ),
                                        ];

                                    const paymentMethods =
                                        [
                                            ...new Set(
                                                sale.payments.map(
                                                    (
                                                        payment
                                                    ) =>
                                                        payment.paymentMethod
                                                )
                                            ),
                                        ];

                                    return (
                                        <div
                                            key={
                                                sale.id
                                            }
                                            className="rounded-xl bg-white p-5 shadow-sm"
                                        >
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="font-bold text-black">
                                                        {customerNames.join(
                                                            ", "
                                                        ) ||
                                                            "Cliente"}
                                                    </p>

                                                    <p className="mt-1 text-sm text-neutral-500">
                                                        {formatSaleTime(
                                                            sale.createdAt
                                                        )}{" "}
                                                        · Venta #
                                                        {
                                                            sale.id
                                                        }
                                                    </p>

                                                    <p className="mt-2 text-sm text-neutral-600">
                                                        {employeeNames.join(
                                                            ", "
                                                        )}
                                                    </p>

                                                    <p className="mt-1 text-sm text-neutral-500">
                                                        {paymentMethods.join(
                                                            " + "
                                                        )}
                                                    </p>
                                                </div>

                                                <div className="sm:text-right">
                                                    <p className="text-xl font-bold text-black">
                                                        {formatCOP(
                                                            sale.finalTotal
                                                        )}
                                                    </p>

                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedSale(
                                                                sale
                                                            )
                                                        }
                                                        className="mt-3 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-100"
                                                    >
                                                        Ver detalle
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                            )}
                        </div>
                    )}
            </div>

            {selectedSale && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
                        {/* Sale header */}
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-bold text-black">
                                    Venta #{selectedSale.id}
                                </h2>

                                <p className="mt-1 text-sm text-neutral-500">
                                    {formatSaleDateTime(
                                        selectedSale.createdAt
                                    )}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setSelectedSale(null)
                                }
                                className="text-sm font-semibold text-neutral-500 hover:text-black"
                            >
                                Cerrar
                            </button>
                        </div>

                        {/* Customer */}
                        <div className="mt-6">
                            <p className="text-sm font-semibold text-neutral-500">
                                Cliente
                            </p>

                            <p className="mt-1 font-bold text-black">
                                {selectedSale.saleAppointments[0]
                                    ?.appointment.customer.name ||
                                    "Cliente"}
                            </p>

                            {selectedSale.saleAppointments[0]
                                ?.appointment.customer.phone && (
                                <p className="mt-1 text-sm text-neutral-500">
                                    {
                                        selectedSale
                                            .saleAppointments[0]
                                            .appointment.customer
                                            .phone
                                    }
                                </p>
                            )}
                        </div>

                        {/* Participating technicians */}
                        <div className="mt-5">
                            <p className="text-sm font-semibold text-neutral-500">
                                Técnicas
                            </p>

                            <div className="mt-2 flex flex-wrap gap-2">
                                {[
                                    ...new Map(
                                        selectedSale.saleAppointments.map(
                                            (item) => [
                                                item.appointment
                                                    .employee.id,
                                                item.appointment
                                                    .employee,
                                            ]
                                        )
                                    ).values(),
                                ].map((employee) => (
                                    <span
                                        key={employee.id}
                                        className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-semibold text-black"
                                    >
                                        {employee.name}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Sold items */}
                        <div className="mt-6 border-t border-neutral-200 pt-5">
                            <h3 className="font-bold text-black">
                                Servicios y adicionales
                            </h3>

                            <div className="mt-3 space-y-3">
                                {selectedSale.lineItems.map(
                                    (item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-start justify-between gap-4"
                                        >
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                                    {item.itemType ===
                                                    "SERVICE"
                                                        ? "Servicio"
                                                        : item.itemType ===
                                                        "ADDON"
                                                        ? "Adicional"
                                                        : item.itemType}
                                                </p>

                                                <p className="mt-1 text-sm text-neutral-700">
                                                    {item.itemName}
                                                </p>
                                            </div>

                                            <span className="shrink-0 text-sm font-semibold text-black">
                                                {formatCOP(
                                                    item.unitPrice
                                                )}
                                            </span>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Sale totals */}
                        <div className="mt-6 border-t border-neutral-200 pt-5">
                            <div className="flex justify-between gap-4 text-sm">
                                <span className="text-neutral-600">
                                    Subtotal
                                </span>

                                <span className="font-medium text-black">
                                    {formatCOP(
                                        selectedSale.subtotal
                                    )}
                                </span>
                            </div>

                            <div className="mt-2 flex justify-between gap-4 text-sm">
                                <span className="text-neutral-600">
                                    Descuento
                                </span>

                                <span className="font-medium text-black">
                                    -
                                    {formatCOP(
                                        selectedSale.discountTotal
                                    )}
                                </span>
                            </div>

                            <div className="mt-4 flex justify-between gap-4 text-lg font-bold">
                                <span className="text-black">Total</span>

                                <span>
                                    {formatCOP(
                                        selectedSale.finalTotal
                                    )}
                                </span>
                            </div>
                        </div>

                        {/* Payments */}
                        <div className="mt-6 border-t border-neutral-200 pt-5">
                            <h3 className="font-bold text-black">
                                Pagos
                            </h3>

                            <div className="mt-3 space-y-3">
                                {selectedSale.payments.map(
                                    (payment) => (
                                        <div
                                            key={payment.id}
                                            className="rounded-xl bg-neutral-50 p-3"
                                        >
                                            <div className="flex justify-between gap-4 text-sm">
                                                <span className="font-medium text-black">
                                                    {getPaymentLabel(
                                                        payment.paymentMethod
                                                    )}
                                                </span>

                                                <span className="font-semibold text-black">
                                                    {formatCOP(
                                                        payment.amount
                                                    )}
                                                </span>
                                            </div>

                                            {payment.processingFee >
                                                0 && (
                                                <div className="mt-2 flex justify-between gap-4 text-xs text-neutral-500">
                                                    <span>
                                                        Comisión de procesamiento
                                                    </span>

                                                    <span>
                                                        {formatCOP(
                                                            payment.processingFee
                                                        )}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                )}
                            </div>

                            <div className="mt-4 flex justify-between gap-4 text-sm font-bold">
                                <span className="text-black">Total Pagado</span>

                                <span>
                                    {formatCOP(
                                        selectedSale.payments.reduce(
                                            (sum, payment) =>
                                                sum +
                                                payment.amount,
                                            0
                                        )
                                    )}
                                </span>
                            </div>
                        </div>

                        {/* Tips */}
                        <div className="mt-6 border-t border-neutral-200 pt-5">
                            <h3 className="font-bold text-black">
                                Propinas
                            </h3>

                            {selectedSale.tips.length === 0 ? (
                                <p className="mt-3 text-sm text-neutral-500">
                                    Sin propinas registradas.
                                </p>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    {selectedSale.tips.map(
                                        (tip) => (
                                            <div
                                                key={tip.id}
                                                className="rounded-xl bg-neutral-50 p-3"
                                            >
                                                <div className="flex justify-between gap-4 text-sm">
                                                    <span className="font-semibold text-black">
                                                        {
                                                            tip
                                                                .employee
                                                                .name
                                                        }
                                                    </span>

                                                    <span className="font-semibold text-black">
                                                        {formatCOP(
                                                            tip.amount
                                                        )}
                                                    </span>
                                                </div>

                                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                                                    <span>
                                                        {getPaymentLabel(
                                                            tip.paymentMethod
                                                        )}
                                                    </span>

                                                    <span>
                                                        Estado:{" "}
                                                        {getStatusLabel(
                                                            tip.status
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Commissions */}
                        <div className="mt-6 border-t border-neutral-200 pt-5">
                            <h3 className="font-bold text-black">
                                Comisiones
                            </h3>

                            {selectedSale.commissions.length ===
                            0 ? (
                                <p className="mt-3 text-sm text-neutral-500">
                                    Sin comisiones registradas.
                                </p>
                            ) : (
                                <div className="mt-3 space-y-3">
                                    {selectedSale.commissions.map(
                                        (commission) => (
                                            <div
                                                key={
                                                    commission.id
                                                }
                                                className="rounded-xl bg-neutral-50 p-3"
                                            >
                                                <div className="flex items-start justify-between gap-4">
                                                    <div>
                                                        <p className="font-semibold text-black">
                                                            {
                                                                commission
                                                                    .employee
                                                                    .name
                                                            }
                                                        </p>

                                                        <p className="mt-1 text-xs text-neutral-500">
                                                            Base:{" "}
                                                            {formatCOP(
                                                                commission.commissionBase
                                                            )}
                                                        </p>

                                                        <p className="mt-1 text-xs text-neutral-500">
                                                            Tasa:{" "}
                                                            {
                                                                commission.commissionRate
                                                            }
                                                            %
                                                        </p>

                                                        <p className="mt-1 text-xs text-neutral-500">
                                                            Estado:{" "}
                                                            {getStatusLabel(
                                                                commission.status
                                                            )}
                                                        </p>
                                                    </div>

                                                    <span className="font-bold text-black">
                                                        {formatCOP(
                                                            commission.commissionAmount
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}