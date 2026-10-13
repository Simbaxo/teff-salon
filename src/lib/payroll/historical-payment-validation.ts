
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

    idempotencyKey: string;
    paymentReference: string | null;
    confirmedDelivered: boolean;
    confirmedNotPreviouslyRecorded: boolean;
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

    // Require a unique UUID for each payment-recording operation.
    if (
        typeof value.idempotencyKey !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value.idempotencyKey
        )
    ) {
        return {
            success: false,
            error: "La clave única del pago debe ser un UUID válido.",
        };
    }

    // The Owner must explicitly verify that money was delivered.
    if (value.confirmedDelivered !== true) {
        return {
            success: false,
            error:
                "Debes confirmar que este pago ya fue entregado.",
        };
    }

    // The Owner must verify this payment is not already accounted for
    // by a paid commission, delivered tip, or historical payment.
    if (value.confirmedNotPreviouslyRecorded !== true) {
        return {
            success: false,
            error:
                "Debes confirmar que este pago no está registrado previamente en comisiones, propinas o pagos históricos.",
        };
    }

    // Optional reference for a bank transfer or payment receipt.
    if (
        value.paymentReference !== undefined &&
        value.paymentReference !== null &&
        typeof value.paymentReference !== "string"
    ) {
        return {
            success: false,
            error: "Referencia de pago inválida.",
        };
    }

    const paymentReference =
        typeof value.paymentReference === "string"
            ? value.paymentReference.trim()
            : "";

    if (paymentReference.length > 120) {
        return {
            success: false,
            error:
                "La referencia de pago no puede superar 120 caracteres.",
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

            idempotencyKey: value.idempotencyKey as string,
            paymentReference: paymentReference || null,
            confirmedDelivered: true,
            confirmedNotPreviouslyRecorded: true,
        },
    };
}