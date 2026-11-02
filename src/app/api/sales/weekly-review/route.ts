
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageStaff } from "@/lib/auth-roles";
import { validatePayrollWeek } from "@/lib/payroll/review-validation";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { getWeeklySalesSnapshot } from "@/lib/sales/weekly-review-snapshot";

function getReviewStatus(
    review: { snapshotHash: string } | null,
    currentHash: string
) {
    if (!review) return "PENDING";

    return review.snapshotHash === currentHash
        ? "REVIEWED"
        : "OUTDATED";
}

export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (!canManageStaff(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    const week = new URL(request.url).searchParams.get("week");
    const start = validatePayrollWeek(week);

    if (!week || !start) {
        return Response.json(
            { error: "Semana inválida." },
            { status: 400 }
        );
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const snapshot = await getWeeklySalesSnapshot(
                tx,
                week
            );

            const review = await tx.weeklySalesReview.findUnique({
                where: { weekStart: start },
                select: {
                    reviewedAt: true,
                    salesCount: true,
                    salesTotal: true,
                    snapshotHash: true,
                    reviewedBy: {
                        select: {
                            name: true,
                        },
                    },
                },
            });

            return {
                week,
                status: getReviewStatus(
                    review,
                    snapshot.snapshotHash
                ),
                canReview: snapshot.canReview,
                issues: snapshot.issues,
                salesCount: snapshot.salesCount,
                salesTotal: snapshot.salesTotal,
                snapshotHash: snapshot.snapshotHash,
                reviewedBy: review?.reviewedBy.name ?? null,
                reviewedAt: review?.reviewedAt ?? null,
            };
        });

        return Response.json(result);
    } catch (error) {
        console.error("Weekly sales review GET failed:", error);

        return Response.json(
            { error: "No se pudo consultar la revisión." },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (!canManageStaff(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    const userId = Number(session.user.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
        return Response.json(
            { error: "Usuario inválido." },
            { status: 401 }
        );
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return Response.json(
            { error: "Solicitud inválida." },
            { status: 400 }
        );
    }

    if (
        !body ||
        typeof body !== "object" ||
        !("week" in body) ||
        !("snapshotHash" in body)
    ) {
        return Response.json(
            { error: "Faltan datos de revisión." },
            { status: 400 }
        );
    }

    const { week, snapshotHash } = body;

    const start = validatePayrollWeek(week);

    if (
        !start ||
        typeof week !== "string" ||
        typeof snapshotHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(snapshotHash)
    ) {
        return Response.json(
            { error: "Datos de revisión inválidos." },
            { status: 400 }
        );
    }

    try {
        const result = await prisma.$transaction(
            async (tx) => {
                // Coordinate with checkout and payroll operations.
                await lockPayrollWeek(tx, start);

                // Verify the reviewer still has an active account.
                const reviewer = await tx.user.findUnique({
                    where: { id: userId },
                    select: {
                        id: true,
                        active: true,
                        role: true,
                    },
                });

                if (
                    !reviewer?.active ||
                    !canManageStaff(reviewer.role)
                ) {
                    return {
                        error: "Usuario no autorizado.",
                        status: 403,
                    };
                }

                // Recalculate after acquiring the lock.
                const snapshot = await getWeeklySalesSnapshot(
                    tx,
                    week
                );

                if (!snapshot.canReview) {
                    return {
                        error: "Hay ventas pendientes de revisión.",
                        status: 409,
                        issues: snapshot.issues,
                    };
                }

                if (snapshot.snapshotHash !== snapshotHash) {
                    return {
                        error: "Las ventas cambiaron. Actualiza la revisión.",
                        status: 409,
                    };
                }

                const review = await tx.weeklySalesReview.upsert({
                    where: {
                        weekStart: start,
                    },
                    create: {
                        weekStart: start,
                        reviewedById: userId,
                        reviewedAt: new Date(),
                        salesCount: snapshot.salesCount,
                        salesTotal: snapshot.salesTotal,
                        snapshotHash: snapshot.snapshotHash,
                    },
                    update: {
                        reviewedById: userId,
                        reviewedAt: new Date(),
                        salesCount: snapshot.salesCount,
                        salesTotal: snapshot.salesTotal,
                        snapshotHash: snapshot.snapshotHash,
                    },
                    select: {
                        reviewedAt: true,
                    },
                });

                return {
                    success: true,
                    status: "REVIEWED",
                    week,
                    reviewedAt: review.reviewedAt,
                };
            },
            {
                isolationLevel: "Serializable",
                maxWait: 5000,
                timeout: 15000,
            }
        );

        if ("error" in result) {
            return Response.json(result, {
                status:
                    typeof result.status === "number"
                        ? result.status
                        : 409,
            });
        }

        return Response.json(result);
    } catch (error) {
        console.error("Weekly sales review POST failed:", error);

        return Response.json(
            {
                error:
                    "No se pudo confirmar la revisión. Actualiza e intenta nuevamente.",
            },
            { status: 409 }
        );
    }
}