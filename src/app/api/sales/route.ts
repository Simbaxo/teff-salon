import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export async function GET(
    request: Request
) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    // OWNER and RECEPTIONIST can review completed sales
    if (!canManageStaff(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    try {
        const { searchParams } =
            new URL(request.url);

        const from = searchParams.get("from");
        const to = searchParams.get("to");

        let createdAt:
            | {
                gte?: Date;
                lt?: Date;
            }
            | undefined;

        if (from || to) {
            createdAt = {};

            if (from) {
                const fromDate =
                    new Date(`${from}T00:00:00-05:00`);

                if (
                    Number.isNaN(
                        fromDate.getTime()
                    )
                ) {
                    return Response.json(
                        { error: "Invalid from date" },
                        { status: 400 }
                    );
                }

                createdAt.gte = fromDate;
            }

            if (to) {
                const toDate =
                    new Date(`${to}T00:00:00-05:00`);

                if (
                    Number.isNaN(
                        toDate.getTime()
                    )
                ) {
                    return Response.json(
                        { error: "Invalid to date" },
                        { status: 400 }
                    );
                }

                // Exclusive upper boundary:
                // 2026-10-08 means everything before Oct 8.
                createdAt.lt = toDate;
            }
        }
        const sales = await prisma.sale.findMany({
            where: createdAt
                ? {
                    createdAt,
                }
                : undefined,
            orderBy: {
                createdAt: "desc",
            },

            include: {
                lineItems: {
                    orderBy: {
                        id: "asc",
                    },
                },

                payments: {
                    orderBy: {
                        id: "asc",
                    },
                },

                commissions: {
                    orderBy: {
                        id: "asc",
                    },

                    include: {
                        employee: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },

                tips: {
                    orderBy: {
                        id: "asc",
                    },

                    include: {
                        employee: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },

                saleAppointments: {
                    orderBy: {
                        appointmentId: "asc",
                    },

                    include: {
                        appointment: {
                            select: {
                                id: true,
                                date: true,
                                startTime: true,

                                customer: {
                                    select: {
                                        id: true,
                                        name: true,
                                        phone: true,
                                    },
                                },

                                employee: {
                                    select: {
                                        id: true,
                                        name: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Commission details are OWNER-only.
        // Receptionists retain access to operational sales data.
        if (session.user.role !== "OWNER") {
            return Response.json(
                sales.map((sale) => ({
                    ...sale,
                    commissions: [],
                }))
            );
        }

        return Response.json(sales);
    } catch (error) {
        console.error(
            "Failed to load sales history:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to load sales history",
            },
            { status: 500 }
        );
    }
}