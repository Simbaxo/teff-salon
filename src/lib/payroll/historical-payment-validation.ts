
export const HISTORICAL_PAYMENT_METHODS = [
    "CASH",
    "TRANSFER",
    "BOLD",
    "OTHER",
] as const;

export type HistoricalPaymentMethod =
    (typeof HISTORICAL_PAYMENT_METHODS)[number];

export type HistoricalPaymentInput = {
    payrollEntryId: number;
    amount: number;
    paymentDate: string;
    paymentMethod: HistoricalPaymentMethod;
    description: string | null;
};

export function validateHistoricalPayment(
    input: unknown
):
    | { success: true; data: HistoricalPaymentInput }
    | { success: false; error: string } {
    if (
        typeof input !== "object" ||
        input === null ||
        Array.isArray(input)
    ) {
        return {
            success: false,
            error: "Datos de pago inválidos.",
        };
    }

    const value = input as Record<string, unknown>;

    if (
        !Number.isSafeInteger(value.payrollEntryId) ||
        Number(value.payrollEntryId) <= 0
    ) {
        return {
            success: false,
            error: "Comprobante de nómina inválido.",
        };
    }

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
        typeof value.paymentDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.paymentDate)
    ) {
        return {
            success: false,
            error: "Fecha de pago inválida.",
        };
    }

    const parsedDate = new Date(
        `${value.paymentDate}T00:00:00.000Z`
    );

    if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !==
            value.paymentDate
    ) {
        return {
            success: false,
            error: "La fecha de pago no existe.",
        };
    }

    if (
        typeof value.paymentMethod !== "string" ||
        !HISTORICAL_PAYMENT_METHODS.some(
            (method) => method === value.paymentMethod
        )
    ) {
        return {
            success: false,
            error: "Método de pago inválido.",
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
            payrollEntryId: value.payrollEntryId as number,
            amount: value.amount as number,
            paymentDate: value.paymentDate,
            paymentMethod:
                value.paymentMethod as HistoricalPaymentMethod,
            description: description || null,
        },
    };
}