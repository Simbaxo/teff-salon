
"use client";

import { useEffect, useState } from "react";

type PayrollStatus = "DRAFT" | "REVIEWED" | "PAID";

type AdjustmentType =
    | "BONUS"
    | "LOAN"
    | "UNIFORM"
    | "OTHER_DEDUCTION";

type PayrollAdjustment = {
    id: number;
    type: AdjustmentType;
    amount: number;
    description: string | null;
};

const adjustmentLabels: Record<AdjustmentType, string> = {
    BONUS: "Bonificación",
    LOAN: "Préstamo",
    UNIFORM: "Uniforme",
    OTHER_DEDUCTION: "Otra Deducción",
};

type PayrollSummary = {
    employeeId: number;
    employeeName: string;
    productionTotal: number;
    commissionTotal: number;
    tipsTotal: number;
    bonusesTotal: number;
    totalEarned: number;
    loansTotal: number;
    uniformsTotal: number;
    otherDeductions: number;
    tipsAlreadyPaid: number;
    netPay: number;
    paidCommissions: number;
    pendingCommissions: number;
    outstandingPay: number;
    assignedCommissionCount: number;
    assignedTipCount: number;
    payrollEntryId: number | null;
    payrollStatus: PayrollStatus;
    requiresReview: boolean;
    adjustments: PayrollAdjustment[];
};

type PayrollPreview = {
    period: {
        id: number | null;
        status: PayrollStatus;
        startDate: string;
        endDate: string;
        payday: string;
    };
    summaries: PayrollSummary[];
    readOnly: boolean;
};

function formatCOP(amount: number) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0,
    }).format(amount);
}

function formatDate(date: string) {
    const [year, month, day] = date.split("-").map(Number);

    return new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

function addDays(date: string, days: number) {
    const [year, month, day] = date.split("-").map(Number);
    const value = new Date(Date.UTC(year, month - 1, day));

    value.setUTCDate(value.getUTCDate() + days);

    return value.toISOString().slice(0, 10);
}

function getCurrentMonday() {
    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());

    const [year, month, day] = today.split("-").map(Number);
    const weekday = new Date(
        Date.UTC(year, month - 1, day)
    ).getUTCDay();

    return addDays(today, -(weekday === 0 ? 6 : weekday - 1));
}

function AmountRow({
    label,
    amount,
    negative = false,
}: {
    label: string;
    amount: number;
    negative?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-4 py-2 text-sm">
            <span className="text-neutral-600">{label}</span>
            <span className="font-semibold tabular-nums text-black">
                {negative && amount > 0 ? "−" : ""}
                {formatCOP(amount)}
            </span>
        </div>
    );
}

export default function PayrollPageClient() {
    const [week, setWeek] = useState(getCurrentMonday);
    const [preview, setPreview] =
        useState<PayrollPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Only one technician's adjustment form is open at a time.
    const [editingEmployeeId, setEditingEmployeeId] =
        useState<number | null>(null);

    const [adjustmentType, setAdjustmentType] =
        useState<AdjustmentType>("BONUS");

    const [adjustmentAmount, setAdjustmentAmount] =
        useState("");

    const [adjustmentDescription, setAdjustmentDescription] =
        useState("");

    const [savingAdjustment, setSavingAdjustment] =
        useState(false);

    const [adjustmentError, setAdjustmentError] =
        useState("");

    // Fetch only a draft preview; never change payment records.
    useEffect(() => {
        const controller = new AbortController();

        async function fetchPreview() {
            try {
                const response = await fetch(
                    `/api/admin/payroll/preview?week=${week}`,
                    { signal: controller.signal }
                );

                if (!response.ok) {
                    throw new Error(
                        "No se pudo cargar la nómina."
                    );
                }

                const data: PayrollPreview = await response.json();

                if (!controller.signal.aborted) {
                    setPreview(data);
                    setError("");
                }
            } catch (caught) {
                if (!controller.signal.aborted) {
                    console.error(caught);
                    setError(
                        "No se pudo cargar la vista previa de nómina."
                    );
                    setPreview(null);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        void fetchPreview();

        return () => controller.abort();
    }, [week]);

    async function saveAdjustment(employeeId: number) {
        const amount = Number(adjustmentAmount);

        if (
            !Number.isSafeInteger(amount) ||
            amount <= 0 ||
            amount > 2_147_483_647
        ) {
            setAdjustmentError(
                "Ingresa un monto válido en pesos colombianos."
            );
            return;
        }

        setSavingAdjustment(true);
        setAdjustmentError("");

        try {
            const response = await fetch(
                "/api/admin/payroll/adjustments",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        week,
                        employeeId,
                        type: adjustmentType,
                        amount,
                        description: adjustmentDescription,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "No se pudo guardar el ajuste."
                );
            }

            // Reload the updated statement from the server.
            const previewResponse = await fetch(
                `/api/admin/payroll/preview?week=${week}`,
                { cache: "no-store" }
            );

            if (!previewResponse.ok) {
                throw new Error(
                    "El ajuste se guardó, pero no se pudo actualizar la nómina."
                );
            }

            const updatedPreview: PayrollPreview =
                await previewResponse.json();

            setPreview(updatedPreview);

            setEditingEmployeeId(null);
            setAdjustmentAmount("");
            setAdjustmentDescription("");
            setAdjustmentType("BONUS");
        } catch (caught) {
            setAdjustmentError(
                caught instanceof Error
                    ? caught.message
                    : "No se pudo guardar el ajuste."
            );
        } finally {
            setSavingAdjustment(false);
        }
    }


    async function deleteAdjustment(adjustmentId: number) {
        const confirmed = window.confirm(
            "¿Seguro que deseas eliminar este ajuste de nómina?"
        );

        if (!confirmed) return;

        setSavingAdjustment(true);
        setAdjustmentError("");

        try {
            const response = await fetch(
                `/api/admin/payroll/adjustments/${adjustmentId}`,
                {
                    method: "DELETE",
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error || "No se pudo eliminar el ajuste."
                );
            }

            // Refresh the payroll preview after deletion.
            const previewResponse = await fetch(
                `/api/admin/payroll/preview?week=${week}`,
                { cache: "no-store" }
            );

            if (!previewResponse.ok) {
                throw new Error(
                    "El ajuste se eliminó, pero no se pudo actualizar la nómina."
                );
            }

            const updatedPreview: PayrollPreview =
                await previewResponse.json();

            setPreview(updatedPreview);
        } catch (caught) {
            setAdjustmentError(
                caught instanceof Error
                    ? caught.message
                    : "No se pudo eliminar el ajuste."
            );
        } finally {
            setSavingAdjustment(false);
        }
    }


    function changeWeek(days: number) {
        setLoading(true);
        setPreview(null);
        setWeek((current) => addDays(current, days));
    }

    return (
        <section className="mt-8">
            <div>
                <h2 className="text-2xl font-bold text-black">
                    Nómina
                </h2>

                <p className="mt-2 text-neutral-500">
                    Período de lunes a domingo. Pago los lunes
                    por la mañana.
                </p>
            </div>

            {/* Payroll week selector */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={() => changeWeek(-7)}
                    className="rounded-xl border border-neutral-300 bg-white px-4 py-3 font-semibold text-black hover:bg-neutral-50"
                >
                    ← Anterior
                </button>

                <div className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">
                    Semana del {formatDate(week)}
                </div>

                <button
                    type="button"
                    onClick={() => changeWeek(7)}
                    className="rounded-xl border border-neutral-300 bg-white px-4 py-3 font-semibold text-black hover:bg-neutral-50"
                >
                    Siguiente →
                </button>
            </div>

            <p className="mt-4 text-sm text-neutral-500">
                Vista previa de solo lectura. No registra pagos.
            </p>

            {loading && (
                <p className="mt-6 text-neutral-500">
                    Calculando nómina...
                </p>
            )}

            {error && (
                <p role="alert" className="mt-6 text-sm text-red-600">
                    {error}
                </p>
            )}

            {adjustmentError && (
                <p role="alert" className="mt-4 text-sm text-red-600">
                    {adjustmentError}
                </p>
            )}

            {!loading && preview && (
                <>
                    <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-black">
                                    Período de Nómina
                                </h3>
                                <p className="mt-2 text-sm text-neutral-600">
                                    {formatDate(preview.period.startDate)}
                                    {" – "}
                                    {formatDate(preview.period.endDate)}
                                </p>
                                <p className="mt-1 text-sm text-neutral-500">
                                    Pago: {formatDate(preview.period.payday)}
                                </p>
                            </div>

                            <span className="rounded-full bg-[#B76E79]/10 px-4 py-2 text-sm font-semibold text-[#B76E79]">
                                {preview.period.status === "DRAFT"
                                    ? "Borrador"
                                    : preview.period.status === "REVIEWED"
                                      ? "Revisado"
                                      : "Pagado"}
                            </span>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {preview.summaries.map((employee) => (
                            <article
                                key={employee.employeeId}
                                className="rounded-2xl bg-white p-5 shadow-sm"
                            >
                                <h3 className="text-xl font-bold text-black">
                                    {employee.employeeName}
                                </h3>

                                <div className="mt-5 border-b border-neutral-200 pb-4">
                                    <AmountRow
                                        label="Producción Total"
                                        amount={employee.productionTotal}
                                    />
                                </div>

                                <div className="mt-3">
                                    <AmountRow
                                        label="Comisiones"
                                        amount={employee.commissionTotal}
                                    />
                                    <AmountRow
                                        label="Propinas Totales"
                                        amount={employee.tipsTotal}
                                    />
                                    <AmountRow
                                        label="Bonificaciones"
                                        amount={employee.bonusesTotal}
                                    />
                                </div>

                                <div className="mt-3 rounded-xl bg-neutral-100 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="font-bold text-black">
                                            Total Ganado
                                        </span>
                                        <span className="text-lg font-bold tabular-nums text-black">
                                            {formatCOP(employee.totalEarned)}
                                        </span>
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <AmountRow
                                        label="Préstamos"
                                        amount={employee.loansTotal}
                                        negative
                                    />
                                    <AmountRow
                                        label="Uniforme"
                                        amount={employee.uniformsTotal}
                                        negative
                                    />
                                    <AmountRow
                                        label="Propinas Ya Entregadas"
                                        amount={employee.tipsAlreadyPaid}
                                        negative
                                    />
                                    <AmountRow
                                        label="Otras Deducciones"
                                        amount={employee.otherDeductions}
                                        negative
                                    />
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-200 pt-4">
                                    <span className="text-lg font-bold text-black">
                                        Pago Neto
                                    </span>
                                    <span className="text-2xl font-bold tabular-nums text-black">
                                        {formatCOP(employee.netPay)}
                                    </span>
                                </div>

                                {employee.requiresReview && (
                                    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                                        Esta nómina requiere revisión antes de pagar.
                                    </p>
                                )}

                                {employee.paidCommissions > 0 && (
                                    <p className="mt-3 text-xs text-neutral-500">
                                        Comisiones ya pagadas:{" "}
                                        {formatCOP(employee.paidCommissions)}
                                    </p>
                                )}

                                <p className="mt-4 text-xs text-neutral-400">
                                    Vista previa · Sin pagos registrados
                                </p>


                                {/* Show saved adjustments for this technician. */}
                                {employee.adjustments.length > 0 && (
                                    <div className="mb-5 space-y-3">
                                        <h4 className="text-sm font-bold text-black">
                                            Ajustes Registrados
                                        </h4>

                                        {employee.adjustments.map((adjustment) => (
                                            <div
                                                key={adjustment.id}
                                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-50 p-3"
                                            >
                                                <div>
                                                    <p className="text-sm font-semibold text-black">
                                                        {adjustmentLabels[adjustment.type]}
                                                    </p>

                                                    {adjustment.description && (
                                                        <p className="mt-1 text-xs text-neutral-500">
                                                            {adjustment.description}
                                                        </p>
                                                    )}

                                                    <p className="mt-1 text-sm font-semibold text-black">
                                                        {adjustment.type === "BONUS" ? "+" : "−"}
                                                        {formatCOP(adjustment.amount)}
                                                    </p>
                                                </div>

                                                {preview.period.status === "DRAFT" &&
                                                    employee.payrollStatus === "DRAFT" && (
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                savingAdjustment ||
                                                                preview.period.status !== "DRAFT" ||
                                                                employee.payrollStatus !== "DRAFT"
                                                            }
                                                            onClick={() =>
                                                                void deleteAdjustment(adjustment.id)
                                                            }
                                                            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    )}
                                            </div>
                                        ))}
                                    </div>
                                )}


                                {/* Payroll adjustments */}
                                <div className="mt-5 border-t border-neutral-200 pt-4">
                                    <button
                                        type="button"
                                        disabled={preview.period.status !== "DRAFT"}
                                        onClick={() => {
                                            setEditingEmployeeId(
                                                editingEmployeeId === employee.employeeId
                                                    ? null
                                                    : employee.employeeId
                                            );
                                            setAdjustmentError("");
                                        }}
                                        className="rounded-xl bg-[#B76E79] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {editingEmployeeId === employee.employeeId
                                            ? "Cancelar"
                                            : "+ Agregar Ajuste"}
                                    </button>

                                    {editingEmployeeId === employee.employeeId && (
                                        <form
                                            className="mt-4 space-y-4 rounded-xl bg-neutral-50 p-4"
                                            onSubmit={(event) => {
                                                event.preventDefault();
                                                void saveAdjustment(employee.employeeId);
                                            }}
                                        >
                                            <div>
                                                <label className="block text-sm font-semibold text-black">
                                                    Tipo de Ajuste
                                                </label>

                                                <select
                                                    value={adjustmentType}
                                                    onChange={(event) =>
                                                        setAdjustmentType(
                                                            event.target.value as AdjustmentType
                                                        )
                                                    }
                                                    className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-3 text-black"
                                                >
                                                    {Object.entries(adjustmentLabels).map(
                                                        ([value, label]) => (
                                                            <option key={value} value={value}>
                                                                {label}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-black">
                                                    Monto (COP)
                                                </label>

                                                <input
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    required
                                                    value={adjustmentAmount}
                                                    onChange={(event) =>
                                                        setAdjustmentAmount(event.target.value)
                                                    }
                                                    className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-3 text-black"
                                                    placeholder="Ej. 100000"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-black">
                                                    Descripción (opcional)
                                                </label>

                                                <textarea
                                                    value={adjustmentDescription}
                                                    maxLength={300}
                                                    onChange={(event) =>
                                                        setAdjustmentDescription(event.target.value)
                                                    }
                                                    rows={2}
                                                    className="mt-2 w-full rounded-lg border border-neutral-300 bg-white p-3 text-black"
                                                    placeholder="Motivo del ajuste"
                                                />
                                            </div>

                                            {adjustmentError && (
                                                <p role="alert" className="text-sm text-red-600">
                                                    {adjustmentError}
                                                </p>
                                            )}

                                            <button
                                                type="submit"
                                                disabled={
                                                    savingAdjustment ||
                                                    preview.period.status !== "DRAFT" ||
                                                    employee.payrollStatus !== "DRAFT"
                                                }
                                                className="rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                                            >
                                                {savingAdjustment
                                                    ? "Guardando..."
                                                    : "Guardar Ajuste"}
                                            </button>
                                        </form>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>

                    {preview.summaries.length === 0 && (
                        <p className="mt-6 text-sm text-neutral-500">
                            No hay técnicas activas para mostrar.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}
