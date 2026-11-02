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

type WeeklyAuditSale = {
    saleId: number;
    saleDate: string;
    serviceDates: string[];
    customers: string[];
    subtotal: number;
    discountTotal: number;
    finalTotal: number;
    attributionMode: string;
    technicians: {
        employeeId: number;
        name: string;
        production: number;
        services: {
            id: number;
            name: string;
            type: string;
            price: number;
        }[];
    }[];
    payments: {
        paymentMethod: string;
        amount: number;
        processingFee: number;
    }[];
    tips: {
        employeeId: number;
        employeeName: string;
        amount: number;
        paymentMethod: string;
    }[];
    issues: string[];
};

type WeeklyAuditResponse = {
    week: string;
    readOnly: boolean;
    sales: WeeklyAuditSale[];
    snapshotHash: string;
    canReview: boolean;
    reviewIssues: {
        saleId: number;
        codes: string[];
    }[];
};

type WeeklyReviewStatus = {
    week: string;
    status: "PENDING" | "REVIEWED" | "OUTDATED";
    canReview: boolean;
    issues: {
        saleId: number;
        codes: string[];
    }[];
    salesCount: number;
    salesTotal: number;
    snapshotHash: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
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

function getPayrollMonday(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return "";
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        return "";
    }

    const weekday = date.getUTCDay();

    return addDays(
        value,
        -(weekday === 0 ? 6 : weekday - 1)
    );
}

export default function SalesPageClient({
    userRole,
}: {
    userRole: "OWNER" | "RECEPTIONIST";
}) {
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

    const [refreshKey, setRefreshKey] = useState(0);

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

    const [showWeeklyAudit, setShowWeeklyAudit] =
        useState(false);

    const [auditWeek, setAuditWeek] = useState(() => {
        const today = getBogotaDateString();
        const date = new Date(`${today}T00:00:00.000Z`);
        const weekday = date.getUTCDay();

        return addDays(
            today,
            -(weekday === 0 ? 6 : weekday - 1)
        );
    });

    const [weeklyAudit, setWeeklyAudit] =
        useState<WeeklyAuditResponse | null>(null);

    const [weeklyAuditLoading, setWeeklyAuditLoading] =
        useState(false);

    const [weeklyAuditError, setWeeklyAuditError] =
        useState("");

    const [expandedAuditEmployeeId, setExpandedAuditEmployeeId] =
        useState<number | null>(null);

    const [weeklyReviewStatus, setWeeklyReviewStatus] =
        useState<WeeklyReviewStatus | null>(null);

    const [weeklyReviewError, setWeeklyReviewError] =
        useState("");

    const [weeklyReviewLoading, setWeeklyReviewLoading] =
        useState(false);

    const [isConfirmingWeeklyReview, setIsConfirmingWeeklyReview] =
        useState(false);

    const [weeklyReviewActionError, setWeeklyReviewActionError] =
        useState("");

    useEffect(() => {
        const controller = new AbortController();

        // Calculate the selected date range inside the effect.
        const [year, month, day] = today.split("-").map(Number);
        const todayDate = new Date(Date.UTC(year, month - 1, day));

        let from: string;
        let to: string;

        if (dateRange === "TODAY") {
            from = today;
            to = addDays(today, 1);
        } else if (dateRange === "WEEK") {
            const weekday = todayDate.getUTCDay();
            const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

            from = addDays(today, -daysSinceMonday);
            to = addDays(today, 1);
        } else if (dateRange === "MONTH") {
            from = `${year}-${String(month).padStart(2, "0")}-01`;
            to = addDays(today, 1);
        } else {
            from = customFrom;
            to = addDays(customTo, 1);
        }

        async function loadSales() {
            try {
                const response = await fetch(
                    `/api/sales?from=${from}&to=${to}`,
                    { signal: controller.signal }
                );

                if (!response.ok) {
                    throw new Error(
                        "No se pudo cargar el historial de ventas."
                    );
                }

                const data: Sale[] = await response.json();

                if (!controller.signal.aborted) {
                    setSales(data);
                    setLoadError("");
                    setIsLoading(false);
                }
            } catch (error) {
                if (controller.signal.aborted) return;

                console.error(error);
                setLoadError(
                    "No se pudo cargar el historial de ventas."
                );
                setIsLoading(false);
            }
        }

        void loadSales();

        return () => {
            controller.abort();
        };
    }, [dateRange, customFrom, customTo, today, refreshKey]);

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

    useEffect(() => {
        if (!showWeeklyAudit) return;

        const controller = new AbortController();

        async function loadWeeklyAudit() {
            try {
                const response = await fetch(
                    `/api/sales/weekly-audit?week=${encodeURIComponent(auditWeek)}`,
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        "No se pudo cargar la revisión semanal."
                    );
                }

                const data: WeeklyAuditResponse =
                    await response.json();

                if (controller.signal.aborted) return;

                if (data.week !== auditWeek) {
                    throw new Error("La semana recibida no coincide.");
                }

                setWeeklyAudit(data);
                setWeeklyAuditError("");
                setWeeklyAuditLoading(false);
            } catch (error) {
                if (controller.signal.aborted) return;

                console.error(error);
                setWeeklyAuditError(
                    "No se pudo cargar la revisión semanal."
                );
                setWeeklyAuditLoading(false);
            }
        }

        void loadWeeklyAudit();

        return () => controller.abort();
    }, [showWeeklyAudit, auditWeek]);

    useEffect(() => {
        if (
            !showWeeklyAudit ||
            weeklyAudit?.week !== auditWeek ||
            !weeklyAudit.snapshotHash
        ) {
            return;
        }

        const controller = new AbortController();

        async function loadReviewStatus() {
            try {
                const response = await fetch(
                    `/api/sales/weekly-review?week=${encodeURIComponent(auditWeek)}`,
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        "No se pudo consultar el estado de revisión."
                    );
                }

                const data: WeeklyReviewStatus =
                    await response.json();

                if (controller.signal.aborted) return;

                if (data.week !== auditWeek) {
                    throw new Error(
                        "La semana consultada no coincide."
                    );
                }

                setWeeklyReviewStatus(data);
                setWeeklyReviewError("");
                setWeeklyReviewLoading(false);
            } catch (error) {
                if (controller.signal.aborted) return;

                console.error(error);
                setWeeklyReviewError(
                    "No se pudo consultar el estado de revisión."
                );
                setWeeklyReviewLoading(false);
            }
        }

        void loadReviewStatus();

        return () => controller.abort();
    }, [showWeeklyAudit, auditWeek, weeklyAudit]);

    async function confirmWeeklyReview() {
        const audit = weeklyAudit;
        const review = weeklyReviewStatus;
        const requestedWeek = auditWeek;

        if (
            !audit ||
            !review ||
            audit.week !== requestedWeek ||
            review.week !== requestedWeek ||
            audit.snapshotHash !== review.snapshotHash ||
            !audit.canReview ||
            !review.canReview ||
            audit.reviewIssues.length > 0 ||
            review.status === "REVIEWED" ||
            isConfirmingWeeklyReview
        ) {
            setWeeklyReviewActionError(
                "Actualiza la revisión antes de confirmar."
            );
            return;
        }

        const reviewedHash = audit.snapshotHash;

        setIsConfirmingWeeklyReview(true);
        setWeeklyReviewActionError("");

        try {
            const response = await fetch(
                "/api/sales/weekly-review",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        week: requestedWeek,
                        snapshotHash: reviewedHash,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ??
                        "No se pudo confirmar la revisión."
                );
            }

            // Verify the saved review against the current data.
            const verification = await fetch(
                `/api/sales/weekly-review?week=${encodeURIComponent(requestedWeek)}`,
                { cache: "no-store" }
            );

            if (!verification.ok) {
                throw new Error(
                    "No se pudo verificar la confirmación."
                );
            }

            const updated: WeeklyReviewStatus =
                await verification.json();

            if (
                updated.week !== requestedWeek ||
                updated.snapshotHash !== reviewedHash ||
                updated.status !== "REVIEWED"
            ) {
                throw new Error(
                    "La revisión requiere una nueva verificación."
                );
            }

            setWeeklyReviewStatus(updated);
        } catch (error) {
            setWeeklyReviewActionError(
                error instanceof Error
                    ? error.message
                    : "No se pudo confirmar la revisión."
            );
        } finally {
            setIsConfirmingWeeklyReview(false);
        }
    }

    return (
        <div className="mt-8">
            {/* Weekly sales audit — OWNER and RECEPTIONIST */}
            <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm">
                <button
                    type="button"
                    onClick={() => {
                        if (showWeeklyAudit) {
                            setShowWeeklyAudit(false);
                            setWeeklyAuditLoading(false);
                        } else {
                            setWeeklyAuditLoading(true);
                            setWeeklyAuditError("");
                            setWeeklyAudit(null);
                            setShowWeeklyAudit(true);
                        }
                    }}
                    aria-expanded={showWeeklyAudit}
                    className="flex w-full items-center justify-between gap-3 text-left"
                >
                    <div>
                        <h2 className="text-lg font-bold text-black">
                            Revisión Semanal
                        </h2>
                        <p className="mt-1 text-sm text-neutral-500">
                            Verifica las ventas y la producción por técnica.
                        </p>
                    </div>
                    <span className="text-xl font-semibold text-[#B76E79]">
                        {showWeeklyAudit ? "−" : "+"}
                    </span>
                </button>

                {showWeeklyAudit && (
                    <div className="mt-5 border-t border-neutral-200 pt-5">
                        <div className="flex flex-wrap items-end gap-3">
                            <div>
                                <label
                                    htmlFor="audit-week"
                                    className="block text-sm font-semibold text-black"
                                >
                                    Semana (lunes)
                                </label>
                                <input
                                    id="audit-week"
                                    type="date"
                                    value={auditWeek}
                                    onChange={(event) => {
                                        const monday = getPayrollMonday(
                                            event.target.value
                                        );

                                        if (!monday) return;

                                        setAuditWeek(monday);
                                        setWeeklyAuditLoading(true);
                                        setWeeklyAuditError("");
                                        setWeeklyAudit(null);
                                        setExpandedAuditEmployeeId(null);
                                    }}
                                    className="mt-2 rounded-xl border border-neutral-300 bg-white px-4 py-3 text-black"
                                />
                            </div>
                            <span className="pb-3 text-sm text-neutral-500">
                                Hasta {addDays(auditWeek, 6)}
                            </span>
                        </div>

                        {weeklyAuditLoading && (
                            <p className="mt-4 text-sm text-neutral-500">
                                Cargando revisión semanal...
                            </p>
                        )}

                        {weeklyAuditError && (
                            <p role="alert" className="mt-4 text-sm text-red-600">
                                {weeklyAuditError}
                            </p>
                        )}

                        {!weeklyAuditLoading &&
                            !weeklyAuditError &&
                            weeklyAudit?.week === auditWeek && (
                                <div className="mt-5 space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-xl bg-neutral-100 p-4">
                                            <p className="text-sm text-neutral-500">
                                                Ventas registradas
                                            </p>
                                            <p className="mt-1 text-2xl font-bold text-black">
                                                {weeklyAudit.sales.length}
                                            </p>
                                        </div>
                                        <div className="rounded-xl bg-neutral-100 p-4">
                                            <p className="text-sm text-neutral-500">
                                                Total ventas
                                            </p>
                                            <p className="mt-1 text-2xl font-bold text-black">
                                                {formatCOP(
                                                    weeklyAudit.sales.reduce(
                                                        (sum, sale) =>
                                                            sum + sale.finalTotal,
                                                        0
                                                    )
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {Array.from(
                                        new Map(
                                            weeklyAudit.sales.flatMap((sale) =>
                                                sale.technicians.map((technician) => [
                                                    technician.employeeId,
                                                    technician.name,
                                                ] as const)
                                            )
                                        )
                                    ).map(([employeeId, employeeName]) => {
                                        const employeeSales =
                                            weeklyAudit.sales.filter((sale) =>
                                                sale.technicians.some(
                                                    (technician) =>
                                                        technician.employeeId === employeeId
                                                )
                                            );

                                        const production = employeeSales.reduce(
                                            (sum, sale) =>
                                                sum +
                                                (sale.technicians.find(
                                                    (technician) =>
                                                        technician.employeeId === employeeId
                                                )?.production ?? 0),
                                            0
                                        );

                                        return (
                                            <div
                                                key={employeeId}
                                                className="rounded-xl border border-neutral-200"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setExpandedAuditEmployeeId(
                                                            expandedAuditEmployeeId === employeeId
                                                                ? null
                                                                : employeeId
                                                        )
                                                    }
                                                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                                                >
                                                    <div>
                                                        <p className="font-semibold text-black">
                                                            {employeeName}
                                                        </p>
                                                        <p className="mt-1 text-sm text-neutral-500">
                                                            {employeeSales.length} ventas
                                                        </p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-black">
                                                            {formatCOP(production)}
                                                        </p>
                                                        <span className="text-sm text-[#B76E79]">
                                                            {expandedAuditEmployeeId === employeeId
                                                                ? "Ocultar"
                                                                : "Ver ventas"}
                                                        </span>
                                                    </div>
                                                </button>

                                                {expandedAuditEmployeeId === employeeId && (
                                                    <div className="space-y-3 border-t border-neutral-200 p-4">
                                                        {employeeSales.map((sale) => {
                                                            const technician =
                                                                sale.technicians.find(
                                                                    (item) =>
                                                                        item.employeeId === employeeId
                                                                );

                                                            return (
                                                                <div
                                                                    key={sale.saleId}
                                                                    className="rounded-lg bg-neutral-50 p-3"
                                                                >
                                                                    <a
                                                                        href={`/sales?saleId=${sale.saleId}`}
                                                                        className="font-semibold text-[#B76E79] hover:underline"
                                                                    >
                                                                        Venta #{sale.saleId}
                                                                    </a>
                                                                    <p className="mt-1 text-xs text-neutral-500">
                                                                        {sale.customers.join(", ")}
                                                                    </p>
                                                                    <p className="mt-2 text-sm font-semibold text-black">
                                                                        Producción:{" "}
                                                                        {formatCOP(
                                                                            technician?.production ?? 0
                                                                        )}
                                                                    </p>
                                                                    {technician?.services.map((service) => (
                                                                        <div
                                                                            key={service.id}
                                                                            className="mt-1 flex justify-between gap-2 text-xs text-neutral-600"
                                                                        >
                                                                            <span>{service.name}</span>
                                                                            <span>
                                                                                {formatCOP(service.price)}
                                                                            </span>
                                                                        </div>
                                                                    ))}

                                                                    {/* Complete transaction reconciliation */}
                                                                    <div className="mt-3 border-t border-neutral-200 pt-3 text-sm text-neutral-700">
                                                                        <p className="mb-2 text-xs font-semibold text-neutral-500">
                                                                            Venta completa (puede incluir varias técnicas)
                                                                        </p>

                                                                        <div className="flex justify-between gap-2">
                                                                            <span>Subtotal</span>
                                                                            <span>{formatCOP(sale.subtotal)}</span>
                                                                        </div>

                                                                        <div className="mt-1 flex justify-between gap-2">
                                                                            <span>Descuento</span>
                                                                            <span>-{formatCOP(sale.discountTotal)}</span>
                                                                        </div>

                                                                        <div className="mt-2 flex justify-between gap-2 font-semibold text-black">
                                                                            <span>Total venta</span>
                                                                            <span>{formatCOP(sale.finalTotal)}</span>
                                                                        </div>

                                                                        <div className="mt-3 border-t border-neutral-200 pt-2">
                                                                            <p className="font-semibold text-black">
                                                                                Pagos recibidos
                                                                            </p>

                                                                            {sale.payments.map((payment, index) => (
                                                                                <div
                                                                                    key={index}
                                                                                    className="mt-1 flex justify-between gap-2"
                                                                                >
                                                                                    <span>{payment.paymentMethod}</span>
                                                                                    <span>{formatCOP(payment.amount)}</span>
                                                                                </div>
                                                                            ))}

                                                                            {sale.payments.some(
                                                                                (payment) => payment.processingFee > 0
                                                                            ) && (
                                                                                <p className="mt-2 text-xs text-neutral-500">
                                                                                    Recargo Bold registrado por separado.
                                                                                </p>
                                                                            )}
                                                                        </div>

                                                                        {sale.tips.length > 0 && (
                                                                            <div className="mt-3 border-t border-neutral-200 pt-2">
                                                                                <p className="font-semibold text-black">
                                                                                    Propinas
                                                                                </p>

                                                                                {sale.tips.map((tip, index) => (
                                                                                    <div
                                                                                        key={index}
                                                                                        className="mt-1 flex justify-between gap-2"
                                                                                    >
                                                                                        <span>
                                                                                            {tip.employeeName} · {tip.paymentMethod}
                                                                                        </span>
                                                                                        <span>{formatCOP(tip.amount)}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {sale.issues.length > 0 && (
                                                                        <p className="mt-2 text-xs font-semibold text-amber-700">
                                                                            Revisar venta:{" "}
                                                                            {sale.issues.join(", ")}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Sales requiring receptionist review */}
                                    {weeklyAudit.sales.some(
                                        (sale) => sale.issues.length > 0
                                    ) && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                            <h3 className="font-bold text-amber-900">
                                                Ventas por revisar
                                            </h3>

                                            <p className="mt-1 text-sm text-amber-800">
                                                Verifica las ventas con diferencias o asignaciones
                                                incompletas antes de preparar la nómina.
                                            </p>

                                            <div className="mt-4 space-y-3">
                                                {weeklyAudit.sales
                                                    .filter((sale) => sale.issues.length > 0)
                                                    .map((sale) => (
                                                        <div
                                                            key={sale.saleId}
                                                            className="rounded-lg border border-amber-200 bg-white p-3"
                                                        >
                                                            <a
                                                                href={`/sales?saleId=${sale.saleId}`}
                                                                className="font-semibold text-[#B76E79] hover:underline"
                                                            >
                                                                Venta #{sale.saleId}
                                                            </a>

                                                            <p className="mt-1 text-sm text-neutral-600">
                                                                {sale.customers.join(", ")}
                                                            </p>

                                                            <p className="mt-1 text-sm font-semibold text-black">
                                                                Total: {formatCOP(sale.finalTotal)}
                                                            </p>

                                                            <p className="mt-2 text-xs text-amber-800">
                                                                {sale.issues.join(", ")}
                                                            </p>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Weekly receptionist review status */}
                                    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                                        <h3 className="font-semibold text-black">
                                            Estado de revisión
                                        </h3>

                                        {(() => {
                                            const currentReview =
                                                weeklyReviewStatus?.week === auditWeek &&
                                                weeklyReviewStatus.snapshotHash ===
                                                    weeklyAudit.snapshotHash
                                                    ? weeklyReviewStatus
                                                    : null;

                                            if (weeklyReviewError) {
                                                return (
                                                    <p className="mt-2 text-sm text-red-600">
                                                        {weeklyReviewError}
                                                    </p>
                                                );
                                            }

                                            if (!currentReview || weeklyReviewLoading) {
                                                return (
                                                    <p className="mt-2 text-sm text-neutral-500">
                                                        Consultando revisión...
                                                    </p>
                                                );
                                            }

                                            if (currentReview.status === "REVIEWED") {
                                                return (
                                                    <div className="mt-2">
                                                        <p className="font-semibold text-green-700">
                                                            ✓ Revisada por recepción
                                                        </p>

                                                        <p className="mt-1 text-sm text-neutral-600">
                                                            Por: {currentReview.reviewedBy ?? "Usuario"}
                                                        </p>

                                                        {currentReview.reviewedAt && (
                                                            <p className="text-sm text-neutral-600">
                                                                {formatSaleDateTime(
                                                                    currentReview.reviewedAt
                                                                )}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div className="mt-3 space-y-3">
                                                    <p className="text-sm font-semibold text-amber-700">
                                                        {currentReview.status === "OUTDATED"
                                                            ? "⚠ Revisión desactualizada"
                                                            : "Pendiente de revisión"}
                                                    </p>

                                                    <p className="text-sm text-neutral-600">
                                                        Verifica las ventas, técnicas, descuentos,
                                                        pagos y propinas antes de confirmar.
                                                    </p>

                                                    {!weeklyAudit.canReview && (
                                                        <p className="text-sm font-medium text-red-600">
                                                            Hay ventas pendientes de revisión.
                                                            Corrige las diferencias antes de continuar.
                                                        </p>
                                                    )}

                                                    {weeklyReviewActionError && (
                                                        <p role="alert" className="text-sm text-red-600">
                                                            {weeklyReviewActionError}
                                                        </p>
                                                    )}

                                                    <button
                                                        type="button"
                                                        disabled={
                                                            isConfirmingWeeklyReview ||
                                                            !weeklyAudit.canReview ||
                                                            !currentReview.canReview ||
                                                            weeklyAudit.reviewIssues.length > 0
                                                        }
                                                        onClick={() => void confirmWeeklyReview()}
                                                        className="w-full rounded-xl bg-black px-5 py-3 font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        {isConfirmingWeeklyReview
                                                            ? "Confirmando revisión..."
                                                            : "Marcar semana como revisada"}
                                                    </button>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                    </div>
                )}
            </section>
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
                            onClick={() => setRefreshKey((current) => current + 1)}
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

                                <span className="text-black tabular-nums">
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

                                <span className="text-black tabular-nums">
                                    {formatCOP(
                                        selectedSale.payments.reduce(
                                            (sum, payment) =>
                                                sum + payment.amount,
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

                        {/* Commission details are OWNER-only */}
                        {userRole === "OWNER" && (
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
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}