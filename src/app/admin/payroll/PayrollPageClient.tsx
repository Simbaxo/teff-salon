"use client";

import { useEffect, useRef, useState } from "react";

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
    salaryTotal: number;
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

type WeeklyPayrollSale = {
    commissionId: number;
    saleId: number;
    employeeId: number;
    saleDate: string;
    serviceDates: string[];
    customerNames: string[];
    production: number;
    commissionRate: number;
    commissionAmount: number;
    commissionStatus: string;
    payrollEntryId: number | null;
    saleTotal: number;
    services: {
        id: number;
        name: string;
        type: string;
        price: number;
    }[];
    legacyAttribution: boolean;
    validAttribution: boolean;
    crossWeek: boolean;
};

type WeeklyPayrollSalesResponse = {
    week: string;
    readOnly: boolean;
    sales: WeeklyPayrollSale[];
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

type PayrollDraftPreparation = {
    week: string;
    readyToWrite: boolean;
    readOnly: boolean;
    createCount: number;
    updateCount: number;
    warnings: unknown[];
    statements: {
        employeeId: number;
        employeeName: string;
        action: "CREATE_DRAFT" | "UPDATE_DRAFT";
        salaryTotal: number;
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
    }[];
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
    // Weekly payroll draft preparation.
    const [draftPreparation, setDraftPreparation] =
        useState<PayrollDraftPreparation | null>(null);

    const [preparingDrafts, setPreparingDrafts] =
        useState(false);

    const [draftPreparationError, setDraftPreparationError] =
        useState("");

    const [showDraftConfirmation, setShowDraftConfirmation] =
        useState(false);

    // Technician selected for payment confirmation.
    const [paymentEmployee, setPaymentEmployee] =
        useState<PayrollSummary | null>(null);

    // Require explicit confirmation before recording payment.
    const [paymentConfirmed, setPaymentConfirmed] =
        useState(false);

    // Prevent duplicate submissions while recording.
    const [savingPayment, setSavingPayment] =
        useState(false);

    const [paymentError, setPaymentError] =
        useState("");
    // Technician selected for zero-balance settlement.
    const [zeroBalanceEmployee, setZeroBalanceEmployee] =
        useState<PayrollSummary | null>(null);

    // Require the Owner to confirm that nothing remains owed.
    const [zeroBalanceConfirmed, setZeroBalanceConfirmed] =
        useState(false);

    const [zeroBalanceError, setZeroBalanceError] =
        useState("");
    // Prevent duplicate settlement submissions.
    const [settlingZeroBalance, setSettlingZeroBalance] =
        useState(false);
    // Keep the same payment key when retrying an uncertain request.
    const paymentRequestKey = useRef<string | null>(null);
    // Preserve the original payment date for identical retries.
    const paymentRequestDate = useRef<string | null>(null);
    // Track whether a payment request may have reached the server.
    const paymentRequestSubmitted = useRef(false);
    const [week, setWeek] = useState(getCurrentMonday);
    // Refresh payroll after a successful payment.
    const [refreshKey, setRefreshKey] = useState(0);
    const [preview, setPreview] =
        useState<PayrollPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Payroll approval is strictly OWNER-only.
    const [reviewingPayroll, setReviewingPayroll] =
        useState(false);

    // Store the result of the read-only approval validation.
    const [reviewReady, setReviewReady] =
        useState(false);

    // Display payroll review errors separately from adjustments.
    const [reviewError, setReviewError] =
        useState("");

    // Show the Owner confirmation dialog before approval.
    const [showReviewConfirmation, setShowReviewConfirmation] =
        useState(false);

    // Separate OWNER confirmation for closing a completed payroll week.
    const [showCloseWeekConfirmation, setShowCloseWeekConfirmation] =
        useState(false);

    // Prevent duplicate closing requests.
    const [closingWeek, setClosingWeek] = useState(false);

    // Display errors from the close-week operation.
    const [closeWeekError, setCloseWeekError] = useState("");

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

    const [expandedSalesEmployeeId, setExpandedSalesEmployeeId] =
        useState<number | null>(null);

    const [weeklySales, setWeeklySales] =
        useState<WeeklyPayrollSalesResponse | null>(null);

    const [weeklySalesLoading, setWeeklySalesLoading] =
        useState(false);

    const [weeklySalesError, setWeeklySalesError] =
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
    }, [week, refreshKey]);

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

    // Settle a reviewed statement without recording another payment
    async function handleConfirmZeroBalance() {
        if (
            !zeroBalanceEmployee ||
            !zeroBalanceConfirmed ||
            settlingZeroBalance ||
            zeroBalanceEmployee.payrollEntryId === null ||
            zeroBalanceEmployee.outstandingPay !== 0
        ) {
            return;
        }

        setSettlingZeroBalance(true);
        setZeroBalanceError("");

        try {
            const response = await fetch(
                "/api/admin/payroll/settle-zero-balance",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        payrollEntryId:
                            zeroBalanceEmployee.payrollEntryId,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ??
                        "No se pudo liquidar el comprobante."
                );
            }

            // HTTP 200 alone does not confirm settlement.
            if (
                result.settlementCompleted !== true ||
                result.readOnly === true
            ) {
                throw new Error(
                    "La liquidación todavía está deshabilitada."
                );
            }

            // Refresh only after the server confirms settlement.
            setZeroBalanceEmployee(null);
            setZeroBalanceConfirmed(false);
            setZeroBalanceError("");
            setRefreshKey((current) => current + 1);
        } catch (caught) {
            setZeroBalanceError(
                caught instanceof Error
                    ? caught.message
                    : "No se pudo confirmar la liquidación."
            );
        } finally {
            setSettlingZeroBalance(false);
        }
    }

    // Record money already delivered outside TEFF.
    async function handleConfirmPayment() {
        if (
            !paymentEmployee ||
            !paymentConfirmed ||
            savingPayment ||
            paymentEmployee.payrollEntryId === null ||
            paymentEmployee.outstandingPay <= 0
        ) {
            return;
        }

        setSavingPayment(true);
        setPaymentError("");

        try {
            // Preserve the key across retries within this dialog.
            const idempotencyKey =
                paymentRequestKey.current ?? crypto.randomUUID();

            paymentRequestKey.current = idempotencyKey;

            // Keep the original date unchanged across payment retries.
            const paymentDate = paymentRequestDate.current;

            if (!paymentDate) {
                throw new Error(
                    "No se pudo identificar la fecha del pago. Actualiza la nómina."
                );
            }

            // A network interruption may leave the payment outcome unknown.
            paymentRequestSubmitted.current = true;

            const response = await fetch(
                "/api/admin/payroll/manual-payments",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        payrollEntryId: paymentEmployee.payrollEntryId,
                        amount: paymentEmployee.outstandingPay,
                        paymentDate,
                        paymentMethod: "OTHER",
                        idempotencyKey,
                        paymentReference: null,
                        description: "Pago confirmado por el propietario",
                        confirmedDelivered: true,
                        confirmedNotPreviouslyRecorded: true,
                    }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error ?? "No se pudo registrar el pago."
                );
            }

            // Accept a newly recorded payment or a verified identical retry.
            const paymentWasRecorded =
                result.paymentRecorded === true &&
                (result.alreadyRecorded === true ||
                    (result.readOnly === false &&
                        result.recordedPaymentId != null));

            if (!paymentWasRecorded) {
                throw new Error(
                    "El pago no fue registrado. La función de pagos todavía puede estar deshabilitada."
                );
            }

            // Refresh only after the server confirms recording.
            setPaymentEmployee(null);
            setPaymentConfirmed(false);
            paymentRequestKey.current = null;
            paymentRequestDate.current = null;
            paymentRequestSubmitted.current = false;
            setRefreshKey((current) => current + 1);
        } catch (caught) {
            setPaymentError(
                caught instanceof Error
                    ? caught.message
                    : "No se pudo confirmar el pago."
            );
        } finally {
            setSavingPayment(false);
        }
    }

    // Confirm payroll approval after the Owner reviews the figures.
    async function handleConfirmPayrollReview() {
        if (
            !preview ||
            preview.period.status !== "DRAFT" ||
            !reviewReady ||
            reviewingPayroll
        ) {
            return;
        }

        setReviewingPayroll(true);
        setReviewError("");

        try {
            const response = await fetch(
                "/api/admin/payroll/review/confirm",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        week,
                        write: true,
                        confirmReview: true,
                    }),
                }
            );

            const data = await response.json();

            // The API must confirm the database transaction succeeded.
            if (!response.ok || data.reviewCompleted !== true) {
                throw new Error(
                    data.error ??
                    "No se pudo confirmar la revisión de nómina."
                );
            }

            // Reload the approved payroll from the database.
            const previewResponse = await fetch(
                `/api/admin/payroll/preview?week=${week}`,
                { cache: "no-store" }
            );

            if (!previewResponse.ok) {
                throw new Error(
                    "La nómina fue aprobada, pero no se pudo actualizar la pantalla."
                );
            }

            const updatedPreview: PayrollPreview =
                await previewResponse.json();

            setPreview(updatedPreview);
            setShowReviewConfirmation(false);
            setReviewReady(false);

        } catch (caught) {
            setReviewError(
                caught instanceof Error
                    ? caught.message
                    : "Ocurrió un error al aprobar la nómina."
            );
        } finally {
            setReviewingPayroll(false);
        }
    }

    async function handleCheckCloseWeek() {
        if (
            !preview ||
            preview.period.status !== "REVIEWED" ||
            closingWeek
        ) {
            return;
        }

        setClosingWeek(true);
        setCloseWeekError("");
        setShowCloseWeekConfirmation(false);

        try {
            const response = await fetch(
                "/api/admin/payroll/close-week",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ week }),
                }
            );

            const data = await response.json();

            if (!response.ok || data.readOnly !== true) {
                throw new Error(
                    data.error ??
                    "No se pudo validar el cierre de nómina."
                );
            }

            if (data.readyToClose !== true) {
                const unpaidCount =
                    data.unpaidEmployeeIds?.length ?? 0;

                throw new Error(
                    unpaidCount > 0
                        ? `Hay ${unpaidCount} técnica(s) pendientes de pago o liquidación.`
                        : "La semana todavía no cumple los requisitos para cerrarse."
                );
            }

            setShowCloseWeekConfirmation(true);
        } catch (error) {
            setCloseWeekError(
                error instanceof Error
                    ? error.message
                    : "Ocurrió un error al validar el cierre."
            );
        } finally {
            setClosingWeek(false);
        }
    }

    async function handleConfirmCloseWeek() {
        if (
            !preview ||
            preview.period.status !== "REVIEWED" ||
            !showCloseWeekConfirmation ||
            closingWeek
        ) {
            return;
        }

        setClosingWeek(true);
        setCloseWeekError("");

        try {
            const response = await fetch(
                "/api/admin/payroll/close-week",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        week,
                        closeWeek: true,
                        confirmClose: true,
                    }),
                }
            );

            const data = await response.json();

            if (!response.ok || data.closeCompleted !== true) {
                throw new Error(
                    data.error ??
                    "No se pudo cerrar la semana. Verifica los pagos pendientes."
                );
            }

            // Refresh payroll only after the database confirms closure.
            setShowCloseWeekConfirmation(false);
            setRefreshKey((current) => current + 1);
        } catch (error) {
            setCloseWeekError(
                error instanceof Error
                    ? error.message
                    : "Ocurrió un error al cerrar la semana."
            );
        } finally {
            setClosingWeek(false);
        }
    }

    async function handlePreparePayroll() {
        if (
            !preview ||
            preview.period.status !== "DRAFT" ||
            preparingDrafts
        ) {
            return;
        }

        setPreparingDrafts(true);
        setDraftPreparationError("");
        setDraftPreparation(null);
        setShowDraftConfirmation(false);

        try {
            const response = await fetch(
                "/api/admin/payroll/drafts/prepare",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ week }),
                }
            );

            const data: PayrollDraftPreparation & {
                error?: string;
            } = await response.json();

            if (
                !response.ok ||
                data.readOnly !== true ||
                data.readyToWrite !== true
            ) {
                throw new Error(
                    data.error ??
                    "La nómina tiene conflictos pendientes. No se puede preparar."
                );
            }

            setDraftPreparation(data);
            setShowDraftConfirmation(true);
        } catch (error) {
            setDraftPreparationError(
                error instanceof Error
                    ? error.message
                    : "No se pudo calcular la nómina."
            );
        } finally {
            setPreparingDrafts(false);
        }
    }

    async function handleConfirmPreparePayroll() {
        if (
            !preview ||
            preview.period.status !== "DRAFT" ||
            !showDraftConfirmation ||
            !draftPreparation ||
            draftPreparation.week !== week ||
            preparingDrafts
        ) {
            return;
        }

        setPreparingDrafts(true);
        setDraftPreparationError("");

        try {
            const response = await fetch(
                "/api/admin/payroll/drafts/prepare",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        week,
                        write: true,
                        confirmPrepare: true,
                    }),
                }
            );

            const data = await response.json();

            if (
                !response.ok ||
                data.readOnly !== false ||
                !Array.isArray(data.savedEntries) ||
                data.savedEntries.length !==
                    draftPreparation.statements.length
            ) {
                throw new Error(
                    data.error ??
                    "No se pudo guardar la nómina. Verifica los valores."
                );
            }

            // Verify the server saved the same employee set
            // that the Owner reviewed.
            const expectedIds = draftPreparation.statements
                .map((item) => item.employeeId)
                .sort((a, b) => a - b);

            const savedIds = data.savedEntries
                .map((item: { employeeId: number }) => item.employeeId)
                .sort((a: number, b: number) => a - b);

            if (
                expectedIds.some(
                    (id, index) => id !== savedIds[index]
                )
            ) {
                throw new Error(
                    "La nómina fue guardada, pero los empleados cambiaron. Actualiza la pantalla y verifica los valores."
                );
            }

            setShowDraftConfirmation(false);
            setDraftPreparation(null);
            setRefreshKey((current) => current + 1);
        } catch (error) {
            setDraftPreparationError(
                error instanceof Error
                    ? error.message
                    : "Ocurrió un error al guardar la nómina."
            );
        } finally {
            setPreparingDrafts(false);
        }
    }

    // Validate payroll before asking the Owner to approve it.
    async function handleReviewPayroll() {
        if (!preview || preview.period.status !== "DRAFT") {
            return;
        }

        setReviewingPayroll(true);
        setReviewError("");
        setReviewReady(false);
        setShowReviewConfirmation(false);

        try {
            // Validation only: no write flag is sent.
            const response = await fetch(
                "/api/admin/payroll/review/confirm",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ week }),
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ??
                    "No se pudo validar la nómina."
                );
            }

            // Every financial safeguard must pass.
            if (
                data.readOnly !== true ||
                data.readyForConfirmation !== true ||
                data.financialValidationPassed !== true ||
                data.historicalReconciliationPassed !== true ||
                data.snapshotValidationPassed !== true ||
                data.assignmentValidationPassed !== true ||
                data.assignmentCompletenessPassed !== true
            ) {
                throw new Error(
                    "La nómina tiene validaciones pendientes. Revisa los valores antes de aprobar."
                );
            }

            // The Owner can now review the confirmation dialog.
            setReviewReady(true);
            setShowReviewConfirmation(true);

        } catch (caught) {
            setReviewError(
                caught instanceof Error
                    ? caught.message
                    : "Ocurrió un error al validar la nómina."
            );
        } finally {
            setReviewingPayroll(false);
        }
    }

    function changeWeek(days: number) {
        if (reviewingPayroll || showReviewConfirmation) {
            return;
        }
        // Prevent confirmation from carrying over to another week.
        setReviewReady(false);
        setReviewError("");
        setShowReviewConfirmation(false);

        setLoading(true);
        setPreview(null);
        setWeek((current) => addDays(current, days));
    }

    function toggleEmployeeSales(employeeId: number) {
        const opening = expandedSalesEmployeeId !== employeeId;

        setExpandedSalesEmployeeId(
            opening ? employeeId : null
        );

        setWeeklySales(null);
        setWeeklySalesError("");
        setWeeklySalesLoading(opening);
    }

    useEffect(() => {
        if (expandedSalesEmployeeId === null) {
            return;
        }

        const controller = new AbortController();
        const requestedWeek = week;

        async function loadWeeklySales() {
            try {
                const response = await fetch(
                    `/api/admin/payroll/weekly-sales?week=${encodeURIComponent(requestedWeek)}`,
                    {
                        signal: controller.signal,
                        cache: "no-store",
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        "No se pudieron cargar las ventas."
                    );
                }

                const data: WeeklyPayrollSalesResponse =
                    await response.json();

                if (controller.signal.aborted) return;

                if (data.week !== requestedWeek) {
                    throw new Error(
                        "La semana consultada no coincide."
                    );
                }

                setWeeklySales(data);
                setWeeklySalesError("");
            } catch (error) {
                if (controller.signal.aborted) return;

                console.error(error);
                setWeeklySalesError(
                    "No se pudieron cargar las ventas de esta semana."
                );
            } finally {
                if (!controller.signal.aborted) {
                    setWeeklySalesLoading(false);
                }
            }
        }

        void loadWeeklySales();

        return () => {
            controller.abort();
        };
    }, [week, expandedSalesEmployeeId]);

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
                    disabled={reviewingPayroll || showReviewConfirmation}
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
                    disabled={reviewingPayroll || showReviewConfirmation}
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

            {draftPreparationError && (
                <p
                    role="alert"
                    className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                >
                    {draftPreparationError}
                </p>
            )}

            {reviewError && (
                <p
                    role="alert"
                    className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                >
                    {reviewError}
                </p>
            )}

            {closeWeekError && (
                <p
                    role="alert"
                    className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"
                >
                    {closeWeekError}
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

                            <div className="flex flex-wrap items-center gap-3">
                                <span className="rounded-full bg-[#B76E79]/10 px-4 py-2 text-sm font-semibold text-[#B76E79]">
                                    {preview.period.status === "DRAFT"
                                        ? "Borrador"
                                        : preview.period.status === "REVIEWED"
                                        ? "Revisado"
                                        : "Pagado"}
                                </span>

                                {/* Calculate and preview payroll drafts before saving. */}
                                {preview.period.status === "DRAFT" && (
                                    <button
                                        type="button"
                                        onClick={() => void handlePreparePayroll()}
                                        disabled={preparingDrafts || reviewingPayroll || loading}
                                        className="rounded-xl border border-[#B76E79] bg-white px-5 py-3 text-sm font-semibold text-[#B76E79] transition-colors hover:bg-[#B76E79]/5 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {preparingDrafts
                                            ? "Calculando..."
                                            : "Calcular Nómina"}
                                    </button>
                                )}

                                {/* Only draft payroll can enter the review workflow. */}
                                {preview.period.status === "DRAFT" && (
                                    <button
                                        type="button"
                                        onClick={() => void handleReviewPayroll()}
                                        disabled={reviewingPayroll || loading}
                                        className="rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A65D69] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {reviewingPayroll
                                            ? "Validando nómina..."
                                            : "Revisar Nómina"}
                                    </button>
                                )}
                                {/* The Owner explicitly closes a reviewed payroll week. */}
                                {preview.period.status === "REVIEWED" && (
                                    <button
                                        type="button"
                                        onClick={() => void handleCheckCloseWeek()}
                                        disabled={closingWeek || loading}
                                        className="rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A65D69] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {closingWeek
                                            ? "Validando cierre..."
                                            : "Cerrar Semana"}
                                    </button>
                                )}
                            </div>

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

                                {/* Weekly sales breakdown — OWNER only */}
                                <div className="mt-3 border-b border-neutral-200 pb-4">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            void toggleEmployeeSales(employee.employeeId)
                                        }
                                        aria-expanded={
                                            expandedSalesEmployeeId === employee.employeeId
                                        }
                                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left text-sm font-semibold text-[#B76E79] hover:bg-rose-50"
                                    >
                                        <span>Ver ventas de la semana</span>
                                        <span aria-hidden="true">
                                            {expandedSalesEmployeeId === employee.employeeId
                                                ? "−"
                                                : "+"}
                                        </span>
                                    </button>

                                    {expandedSalesEmployeeId === employee.employeeId && (
                                        <div className="mt-3 space-y-3">
                                            {(weeklySalesLoading ||
                                                (!weeklySalesError && weeklySales?.week !== week)) && (
                                                    <p className="text-sm text-neutral-500">
                                                        Cargando ventas...
                                                    </p>
                                            )}

                                            {weeklySalesError && (
                                                <p role="alert" className="text-sm text-red-600">
                                                    {weeklySalesError}
                                                </p>
                                            )}

                                            {!weeklySalesLoading &&
                                                !weeklySalesError &&
                                                weeklySales?.week === week && (
                                                    <>
                                                        {weeklySales.sales
                                                            .filter(
                                                                (sale) =>
                                                                    sale.employeeId ===
                                                                    employee.employeeId
                                                            )
                                                            .map((sale) => (
                                                                <div
                                                                    key={sale.commissionId}
                                                                    className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"
                                                                >
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <a
                                                                            href={`/sales?saleId=${sale.saleId}`}
                                                                            className="font-semibold text-[#B76E79] underline-offset-2 hover:underline"
                                                                        >
                                                                            Venta #{sale.saleId}
                                                                        </a>

                                                                        <span className="text-xs text-neutral-500">
                                                                            {sale.serviceDates.join(", ")}
                                                                        </span>
                                                                    </div>

                                                                    <p className="mt-1 text-xs text-neutral-500">
                                                                        {sale.customerNames.join(", ")}
                                                                    </p>

                                                                    <div className="mt-3 space-y-1 text-sm text-neutral-800">
                                                                        <div className="flex justify-between gap-2">
                                                                            <span>Producción</span>
                                                                            <span className="font-semibold tabular-nums text-black">
                                                                                {formatCOP(sale.production)}
                                                                            </span>
                                                                        </div>

                                                                        <div className="flex justify-between gap-2">
                                                                            <span>Comisión</span>
                                                                            <span className="font-semibold tabular-nums text-black">
                                                                                {formatCOP(sale.commissionAmount)}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {sale.services.length > 0 && (
                                                                        <div className="mt-3 border-t border-neutral-200 pt-2">
                                                                            {sale.services.map((service) => (
                                                                                <div
                                                                                    key={service.id}
                                                                                    className="flex justify-between gap-2 py-1 text-xs text-neutral-600"
                                                                                >
                                                                                    <span>{service.name}</span>
                                                                                    <span>
                                                                                        {formatCOP(service.price)}
                                                                                    </span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    {sale.legacyAttribution && (
                                                                        <p className="mt-2 text-xs text-amber-700">
                                                                            Venta anterior: desglose por técnica no disponible.
                                                                        </p>
                                                                    )}

                                                                    {(!sale.validAttribution || sale.crossWeek) && (
                                                                        <p className="mt-2 text-xs font-semibold text-red-600">
                                                                            Revisar atribución o semana de esta venta.
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            ))}

                                                        {weeklySales.sales.filter(
                                                            (sale) =>
                                                                sale.employeeId === employee.employeeId
                                                        ).length === 0 && (
                                                            <p className="text-sm text-neutral-500">
                                                                No hay ventas con comisión registradas para esta técnica.
                                                            </p>
                                                        )}
                                                    </>
                                                )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-3">
                                    {employee.salaryTotal > 0 && (
                                        <AmountRow
                                            label="Salario Base"
                                            amount={employee.salaryTotal}
                                        />
                                    )}
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

                                {/* Show the remaining amount after previously recorded payments. */}
                                {employee.payrollStatus !== "DRAFT" && (
                                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-neutral-100 p-4">
                                        <span className="font-semibold text-black">
                                            Saldo Pendiente
                                        </span>

                                        <span className="text-xl font-bold tabular-nums text-[#B76E79]">
                                            {formatCOP(employee.outstandingPay)}
                                        </span>
                                    </div>
                                )}

                                {/* Allow payment confirmation only for reviewed statements. */}
                                {preview.period.status === "REVIEWED" &&
                                    employee.payrollStatus === "REVIEWED" &&
                                    employee.payrollEntryId !== null &&
                                    employee.outstandingPay > 0 && (
                                        <button
                                            type="button"
                                            disabled={savingPayment}
                                            onClick={() => {
                                                paymentRequestKey.current = crypto.randomUUID();
                                                paymentRequestDate.current = new Intl.DateTimeFormat("en-CA", {
                                                    timeZone: "America/Bogota",
                                                    year: "numeric",
                                                    month: "2-digit",
                                                    day: "2-digit",
                                                }).format(new Date());
                                                setPaymentEmployee(employee);
                                                setPaymentConfirmed(false);
                                                setPaymentError("");
                                            }}
                                            className="mt-3 w-full rounded-xl bg-[#B76E79] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A65D69] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Marcar como pagada
                                        </button>
                                    )}

                                {/* Settle a reviewed statement with no money outstanding. */}
                                {preview.period.status === "REVIEWED" &&
                                    employee.payrollStatus === "REVIEWED" &&
                                    employee.payrollEntryId !== null &&
                                    employee.outstandingPay === 0 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setZeroBalanceEmployee(employee);
                                                setZeroBalanceConfirmed(false);
                                                setZeroBalanceError("");
                                            }}
                                            className="mt-3 w-full rounded-xl border border-[#B76E79] px-4 py-3 text-sm font-semibold text-[#B76E79] transition-colors hover:bg-rose-50"
                                        >
                                            Liquidar saldo cero
                                        </button>
                                    )}

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

            {/* Review calculated payroll before saving drafts. */}
            {showDraftConfirmation && draftPreparation && (
                <div
                    role="presentation"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="payroll-prepare-title"
                        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3
                            id="payroll-prepare-title"
                            className="text-xl font-bold text-black"
                        >
                            Confirmar Preparación de Nómina
                        </h3>

                        <p className="mt-3 text-sm text-neutral-600">
                            Semana del {formatDate(week)} al{" "}
                            {formatDate(addDays(week, 6))}
                        </p>

                        <p className="mt-3 text-sm text-neutral-700">
                            Se crearán {draftPreparation.createCount} borradores
                            y se actualizarán {draftPreparation.updateCount} existentes.
                            Revisa los valores antes de guardar.
                        </p>

                        <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
                            {draftPreparation.statements.map((statement) => (
                                <div
                                    key={statement.employeeId}
                                    className="rounded-xl border border-neutral-200 p-3"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-black">
                                            {statement.employeeName}
                                        </span>
                                        <span className="text-xs text-neutral-500">
                                            {statement.action === "CREATE_DRAFT"
                                                ? "Nuevo"
                                                : "Actualizar"}
                                        </span>
                                    </div>

                                    <p className="mt-2 text-sm text-neutral-600">
                                        Producción: {formatCOP(statement.productionTotal)}
                                    </p>

                                    <p className="text-sm text-neutral-600">
                                        Comisiones: {formatCOP(statement.commissionTotal)}
                                    </p>

                                    <p className="mt-1 text-sm font-bold text-black">
                                        Pago Neto: {formatCOP(statement.netPay)}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowDraftConfirmation(false);
                                    setDraftPreparation(null);
                                }}
                                disabled={preparingDrafts}
                                className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-black"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={() => void handleConfirmPreparePayroll()}
                                disabled={preparingDrafts}
                                className="rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {preparingDrafts
                                    ? "Guardando..."
                                    : "Confirmar y Guardar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm before permanently closing the payroll week. */}
            {showCloseWeekConfirmation && (
                <div
                    role="presentation"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="payroll-close-week-title"
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3
                            id="payroll-close-week-title"
                            className="text-xl font-bold text-black"
                        >
                            Cerrar Semana
                        </h3>

                        <p className="mt-4 text-sm text-neutral-600">
                            Semana del {formatDate(week)} al{" "}
                            {formatDate(addDays(week, 6))}
                        </p>

                        <p className="mt-3 text-sm text-neutral-700">
                            Confirmo que todos los pagos de esta semana
                            fueron registrados y que no quedan saldos
                            pendientes. Al cerrar la semana, la nómina
                            quedará bloqueada para modificaciones.
                        </p>

                        {closeWeekError && (
                            <p
                                role="alert"
                                className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                            >
                                {closeWeekError}
                            </p>
                        )}

                        <div className="mt-6 flex flex-wrap justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowCloseWeekConfirmation(false);
                                    setCloseWeekError("");
                                }}
                                disabled={closingWeek}
                                className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-black"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={() => void handleConfirmCloseWeek()}
                                disabled={closingWeek}
                                className="rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {closingWeek
                                    ? "Cerrando..."
                                    : "Confirmar Cierre"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Owner confirmation before approving weekly payroll. */}
            {showReviewConfirmation && reviewReady && (
                <div
                    role="presentation"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="payroll-review-title"
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3
                            id="payroll-review-title"
                            className="text-xl font-bold text-black"
                        >
                            Confirmar Revisión de Nómina
                        </h3>

                        <p className="mt-4 text-sm text-neutral-600">
                            Semana del {formatDate(week)} al{" "}
                            {formatDate(addDays(week, 6))}
                        </p>

                        <p className="mt-3 text-sm text-neutral-700">
                            Las validaciones financieras fueron exitosas.
                            Al aprobar esta nómina, los valores quedarán
                            bloqueados para evitar modificaciones.
                        </p>

                        {/* Show approval errors inside the confirmation dialog. */}
                        {reviewError && (
                            <p
                                role="alert"
                                className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                            >
                                {reviewError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowReviewConfirmation(false);
                                    setReviewReady(false);
                                }}
                                className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-black"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleConfirmPayrollReview()}
                                disabled={reviewingPayroll || !reviewReady}
                                className="rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A65D69] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {reviewingPayroll
                                    ? "Confirmando..."
                                    : "Confirmar Revisión"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirm money was delivered before marking payroll paid. */}
            {paymentEmployee && (
                <div
                    role="presentation"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="payroll-payment-title"
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3
                            id="payroll-payment-title"
                            className="text-xl font-bold text-black"
                        >
                            Confirmar Pago
                        </h3>

                        <p className="mt-4 text-sm text-neutral-600">
                            Técnica: <strong>{paymentEmployee.employeeName}</strong>
                        </p>

                        <div className="mt-4 rounded-xl bg-neutral-100 p-4">
                            <p className="text-sm text-neutral-600">
                                Saldo pendiente
                            </p>

                            <p className="mt-1 text-2xl font-bold text-black">
                                {formatCOP(paymentEmployee.outstandingPay)}
                            </p>
                        </div>

                        <label className="mt-5 flex items-start gap-3 text-sm text-neutral-700">
                            <input
                                type="checkbox"
                                checked={paymentConfirmed}
                                onChange={(event) =>
                                    setPaymentConfirmed(event.target.checked)
                                }
                                className="mt-1 h-4 w-4 accent-[#B76E79]"
                            />

                            <span>
                                Confirmo que ya entregué este monto a la técnica
                                fuera de TEFF y que no está registrado previamente.
                            </span>
                        </label>

                        {paymentError && (
                            <p
                                role="alert"
                                className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                            >
                                {paymentError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                disabled={savingPayment}
                                onClick={() => {
                                    // Never cancel while the request is actively processing.
                                    if (savingPayment) {
                                        return;
                                    }

                                    if (paymentRequestSubmitted.current) {
                                        const confirmed = window.confirm(
                                            "Esta solicitud de pago pudo haber sido registrada. " +
                                            "Antes de intentar otro pago, verifica el estado de la nómina. " +
                                            "¿Deseas cerrar esta ventana?"
                                        );

                                        if (!confirmed) {
                                            return;
                                        }
                                    }

                                    setPaymentEmployee(null);
                                    setPaymentConfirmed(false);
                                    setPaymentError("");
                                    paymentRequestKey.current = null;
                                    paymentRequestDate.current = null;
                                    paymentRequestSubmitted.current = false;

                                    // Reload payment status from the server.
                                    setRefreshKey((current) => current + 1);
                                }}
                                className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-black"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={() => void handleConfirmPayment()}
                                disabled={!paymentConfirmed || savingPayment}
                                className="rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A65D69] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {savingPayment
                                    ? "Registrando..."
                                    : "Confirmar y Marcar Pagada"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Confirm reconciliation without creating a payment. */}
            {zeroBalanceEmployee && (
                <div
                    role="presentation"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="zero-balance-title"
                        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                    >
                        <h3
                            id="zero-balance-title"
                            className="text-xl font-bold text-black"
                        >
                            Confirmar Liquidación
                        </h3>

                        <p className="mt-4 text-sm text-neutral-600">
                            Técnica:{" "}
                            <strong>{zeroBalanceEmployee.employeeName}</strong>
                        </p>

                        <div className="mt-4 rounded-xl bg-neutral-100 p-4">
                            <p className="text-sm text-neutral-600">
                                Saldo Pendiente
                            </p>

                            <p className="mt-1 text-2xl font-bold text-black">
                                {formatCOP(zeroBalanceEmployee.outstandingPay)}
                            </p>
                        </div>

                        <p className="mt-4 text-sm text-neutral-600">
                            Esta operación marcará el comprobante como pagado
                            sin registrar un nuevo desembolso.
                        </p>

                        <label className="mt-5 flex items-start gap-3 text-sm text-neutral-700">
                            <input
                                type="checkbox"
                                checked={zeroBalanceConfirmed}
                                onChange={(event) =>
                                    setZeroBalanceConfirmed(event.target.checked)
                                }
                                className="mt-1 h-4 w-4 accent-[#B76E79]"
                            />

                            <span>
                                Confirmo que esta nómina está completamente
                                conciliada y no existe ningún saldo pendiente
                                por pagar.
                            </span>
                        </label>

                        {zeroBalanceError && (
                            <p
                                role="alert"
                                className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"
                            >
                                {zeroBalanceError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setZeroBalanceEmployee(null);
                                    setZeroBalanceConfirmed(false);
                                    setZeroBalanceError("");
                                }}
                                className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-semibold text-black"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={() => void handleConfirmZeroBalance()}
                                disabled={!zeroBalanceConfirmed || settlingZeroBalance}
                                className="rounded-xl bg-[#B76E79] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A65D69] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {settlingZeroBalance
                                    ? "Liquidando..."
                                    : "Confirmar Liquidación"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
