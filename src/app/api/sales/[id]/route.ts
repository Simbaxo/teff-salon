import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const session = await auth();

    // Only Owner and Receptionist can view completed sales.
    if (
        !session?.user ||
        !["OWNER", "RECEPTIONIST"].includes(
            session.user.role
        )
    ) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    const { id } = await context.params;
    const saleId = Number(id);

    if (
        !Number.isSafeInteger(saleId) ||
        saleId <= 0
    ) {
        return Response.json(
            { error: "Invalid sale ID" },
            { status: 400 }
        );
    }

    try {
        const sale = await prisma.sale.findUnique({
            where: {
                id: saleId,
            },
            include: {
                lineItems: true,
                payments: true,

                commissions: {
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

        if (!sale) {
            return Response.json(
                { error: "Sale not found" },
                { status: 404 }
            );
        }

        // Never expose commission information to receptionists.
        if (session.user.role !== "OWNER") {
            return Response.json({
                ...sale,
                commissions: [],
            });
        }

        return Response.json(sale);
    } catch (error) {
        console.error(
            "Failed to load sale:",
            error
        );

        return Response.json(
            { error: "Unable to load sale" },
            { status: 500 }
        );
    }
}