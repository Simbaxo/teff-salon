
import type {
    PayrollAdjustmentInput,
} from "./calculations";

export const PAYROLL_ADJUSTMENT_TYPES = [
    "BONUS",
    "LOAN",
    "UNIFORM",
    "OTHER_DEDUCTION",
] as const;

export type PayrollAdjustmentType =
    (typeof PAYROLL_ADJUSTMENT_TYPES)[number];

export type CreatePayrollAdjustmentInput = {
    week: string;
    employeeId: number;
    type: PayrollAdjustmentType;
    amount: number;
    description: string | null;
};

// Verify a calendar date is real and formatted YYYY-MM-DD.
export function isValidPayrollDate(
    value: unknown
): value is string {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

// Validate input before any database transaction begins.
export function validatePayrollAdjustment(
    input: unknown
):
    | { success: true; data: CreatePayrollAdjustmentInput }
    | { success: false; error: string } {
    if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input)
    ) {
        return {
            success: false,
            error: "Datos de ajuste inválidos.",
        };
    }

    const value = input as Record<string, unknown>;

    if (!isValidPayrollDate(value.week)) {
        return {
            success: false,
            error: "Fecha de semana inválida.",
        };
    }

    // Payroll weeks always start on Monday.
    if (
        new Date(`${value.week}T00:00:00.000Z`)
            .getUTCDay() !== 1
    ) {
        return {
            success: false,
            error: "La semana debe comenzar un lunes.",
        };
    }

    if (
        !Number.isSafeInteger(value.employeeId) ||
        Number(value.employeeId) <= 0
    ) {
        return {
            success: false,
            error: "Técnica inválida.",
        };
    }

    if (
        typeof value.type !== "string" ||
        !PAYROLL_ADJUSTMENT_TYPES.some(
            (type) => type === value.type
        )
    ) {
        return {
            success: false,
            error: "Tipo de ajuste inválido.",
        };
    }

    // Amounts must be positive, whole Colombian pesos.
    if (
        !Number.isSafeInteger(value.amount) ||
        Number(value.amount) <= 0 ||
        Number(value.amount) > 2_147_483_647
    ) {
        return {
            success: false,
            error: "El monto debe ser un número entero positivo.",
        };
    }

    if (
        value.description !== undefined &&
        value.description !== null &&
        typeof value.description !== "string"
    ) {
        return {
            success: false,
            error: "Descripción inválida.",
        };
    }

    const description =
        typeof value.description === "string"
            ? value.description.trim()
            : "";

    if (description.length > 300) {
        return {
            success: false,
            error: "La descripción no puede superar 300 caracteres.",
        };
    }

    return {
        success: true,
        data: {
            week: value.week,
            employeeId: value.employeeId as number,
            type: value.type as PayrollAdjustmentType,
            amount: value.amount as number,
            description: description || null,
        },
    };
}

// Convert persisted adjustments into payroll calculation inputs.
export function toPayrollAdjustments(
    adjustments: {
        type: PayrollAdjustmentType;
        amount: number;
    }[]
): PayrollAdjustmentInput[] {
    return adjustments.map((adjustment) => ({
        type: adjustment.type,
        amount: adjustment.amount,
    }));
}
