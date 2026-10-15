import { Prisma } from "@/generated/prisma/client";
import { getPayrollOwner } from "@/lib/payroll/owner-auth";
import { settleZeroBalance } from "@/lib/payroll/settle-zero-balance";

// Read-only preflight. No payroll status is changed.
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

    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body) ||
        !("payrollEntryId" in body) ||
        !Number.isSafeInteger(body.payrollEntryId) ||
        Number(body.payrollEntryId) <= 0
    ) {
        return Response.json(
            { error: "Comprobante de nómina inválido." },
            { status: 400 }
        );
    }

    const payrollEntryId = Number(body.payrollEntryId);

    try {
        const result = await settleZeroBalance({
            payrollEntryId,
            ownerId: owner.ownerId,
        });

        return Response.json(result);
    } catch (error) {
        // Reject settlement if Owner authorization is no longer valid.
        if (
            error instanceof Error &&
            error.message === "PAYROLL_OWNER_REQUIRED"
        ) {
            return Response.json(
                {
                    error: "Solo el propietario puede liquidar nóminas.",
                    conflictType: "PAYROLL_OWNER_REQUIRED",
                },
                { status: 403 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "ZERO_BALANCE_NOT_ELIGIBLE"
        ) {
            return Response.json(
                {
                    error:
                        "Este comprobante no puede liquidarse porque no está revisado, tiene saldo pendiente o presenta un sobrepago.",
                    conflictType: "ZERO_BALANCE_NOT_ELIGIBLE",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "PAYROLL_SETTLEMENT_CONFLICT"
        ) {
            return Response.json(
                {
                    error:
                        "No se pudo liquidar el comprobante porque su estado cambió.",
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

        console.error("Zero-balance settlement failed:", error);

        return Response.json(
            { error: "No se pudo validar la liquidación." },
            { status: 500 }
        );
    }
}