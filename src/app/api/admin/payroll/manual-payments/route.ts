import { Prisma } from "@/generated/prisma/client";
import { getPayrollOwner } from "@/lib/payroll/owner-auth";
import { validateManualPayment } from "@/lib/payroll/manual-payment-validation";
import { recordManualPayment } from "@/lib/payroll/record-manual-payment";

// Validation only. No payment records are created.
export async function POST(request: Request) {
    const owner = await getPayrollOwner();

    if (!owner.success) {
        return Response.json(
            { error: owner.error },
            { status: owner.status }
        );
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return Response.json(
            { error: "JSON inválido." },
            { status: 400 }
        );
    }

    const validation = validateManualPayment(body);

    if (!validation.success) {
        return Response.json(
            { error: validation.error },
            { status: 400 }
        );
    }

    const input = validation.data;

    try {
        // Only the authenticated Owner can record payroll payments.
        const result = await recordManualPayment({
            input,
            ownerId: owner.ownerId,
        });

        return Response.json(result);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "PAYROLL_SETTLEMENT_CONFLICT"
        ) {
            return Response.json(
                {
                    error:
                        "No se pudo liquidar la nómina porque su estado cambió.",
                    conflictType: "PAYROLL_SETTLEMENT_CONFLICT",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "IDEMPOTENCY_CONFLICT"
        ) {
            return Response.json(
                {
                    error:
                        "Esta clave de pago ya fue utilizada para registrar un pago diferente.",
                    conflictType: "IDEMPOTENCY_CONFLICT",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "INVALID_PAYMENT_BALANCE"
        ) {
            return Response.json(
                {
                    error:
                        "El monto supera el saldo pendiente o la nómina ya está liquidada.",
                    conflictType: "INVALID_PAYMENT_BALANCE",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "ENTRY_NOT_FOUND"
        ) {
            return Response.json(
                { error: "Comprobante de nómina no encontrado." },
                { status: 404 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "PAYROLL_NOT_REVIEWED"
        ) {
            return Response.json(
                {
                    error:
                        "Solo se pueden registrar pagos en nóminas revisadas.",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            [
                "DUPLICATE_PAYMENT_KEY",
                "DUPLICATE_PAYMENT_REFERENCE",
            ].includes(error.message)
        ) {
            return Response.json(
                {
                    error:
                        "Este pago o su referencia ya existe.",
                },
                { status: 409 }
            );
        }

        // Handle duplicate payment keys enforced by PostgreSQL.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            return Response.json(
                {
                    error:
                        "Este pago ya fue registrado o su clave ya está en uso. Actualiza la nómina antes de intentarlo nuevamente.",
                    conflictType: "DUPLICATE_PAYMENT_KEY",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2034"
        ) {
            return Response.json(
                {
                    error:
                        "La nómina fue modificada simultáneamente. Inténtalo nuevamente.",
                },
                { status: 409 }
            );
        }

        console.error("Manual payroll validation failed:", error);

        return Response.json(
            {
                error:
                    "No se pudo validar el pago manual.",
            },
            { status: 500 }
        );
    }
}