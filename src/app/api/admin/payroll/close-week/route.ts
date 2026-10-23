
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getPayrollOwner } from "@/lib/payroll/owner-auth";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { validatePayrollWeek } from "@/lib/payroll/review-validation";
import { canCloseWeek } from "@/lib/payroll/can-close-week";

// OWNER-only payroll week closure.
// Validation-only until the closing workflow is fully tested.
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
        !("week" in body)
    ) {
        return Response.json(
            { error: "Semana inválida." },
            { status: 400 }
        );
    }

    const serviceStart = validatePayrollWeek(body.week);

    // A week may only be closed after explicit OWNER confirmation.
    const closeRequested =
        "closeWeek" in body &&
        body.closeWeek === true &&
        "confirmClose" in body &&
        body.confirmClose === true;

    if (!serviceStart) {
        return Response.json(
            { error: "La semana debe comenzar un lunes válido." },
            { status: 400 }
        );
    }

    try {
        const result = await prisma.$transaction(
            async (tx) => {
                await lockPayrollWeek(tx, serviceStart);

                const period = await tx.payrollPeriod.findUnique({
                    where: {
                        startDate: serviceStart,
                    },
                    include: {
                        entries: {
                            select: {
                                id: true,
                                employeeId: true,
                                status: true,
                            },
                        },
                    },
                });

                if (!period) {
                    return {
                        readyToClose: false,
                        reason: "PERIOD_NOT_FOUND",
                        readOnly: true,
                    };
                }

                const unpaidEntries = period.entries.filter(
                    (entry) => entry.status !== "PAID"
                );

                const readyToClose = canCloseWeek({
                    periodStatus: period.status,
                    reviewedAt: period.reviewedAt,
                    entryStatuses: period.entries.map(
                        (entry) => entry.status
                    ),
                });

                // Never close a week with unpaid or unsettled statements.
                if (closeRequested && !readyToClose) {
                    return {
                        periodId: period.id,
                        readyToClose: false,
                        alreadyClosed: period.status === "PAID",
                        unpaidEmployeeIds: unpaidEntries.map(
                            (entry) => entry.employeeId
                        ),
                        closeCompleted: false,
                        readOnly: true,
                    };
                }

                if (closeRequested && readyToClose) {
                    const updated = await tx.payrollPeriod.updateMany({
                        where: {
                            id: period.id,
                            status: "REVIEWED",
                        },
                        data: {
                            status: "PAID",
                            paidAt: new Date(),
                        },
                    });

                    if (updated.count !== 1) {
                        throw new Error("PAYROLL_CLOSE_CONFLICT");
                    }

                    return {
                        periodId: period.id,
                        week: serviceStart.toISOString().slice(0, 10),
                        closeCompleted: true,
                        alreadyClosed: false,
                        readyToClose: false,
                        readOnly: false,
                    };
                }

                return {
                    periodId: period.id,
                    week: serviceStart.toISOString().slice(0, 10),
                    status: period.status,
                    technicianCount: period.entries.length,
                    unpaidEmployeeIds: unpaidEntries.map(
                        (entry) => entry.employeeId
                    ),
                    readyToClose,
                    alreadyClosed: period.status === "PAID",
                    readOnly: true,
                };
            },
            {
                isolationLevel:
                    Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5000,
                timeout: 10000,
            }
        );

        return Response.json(result);
    } catch (error) {
        console.error("Payroll close-week validation failed:", error);

        return Response.json(
            { error: "No se pudo validar el cierre de nómina." },
            { status: 500 }
        );
    }
}
