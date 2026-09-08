import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const customerId = Number(id);

    // Reject malformed customer IDs
    if (!Number.isInteger(customerId) || customerId <= 0) {
        return Response.json(
            { error: "Invalid customer ID" },
            { status: 400 }
        );
    }

    // Load the customer only after authentication and validation
    const customer = await prisma.customer.findUnique({
        where: {
            id: customerId,
        },

        include: {
            appointments: {
                // Show newest appointments first
                orderBy: {
                    date: "desc",
                },

                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },

                    appointmentServices: {
                        include: {
                            service: {
                                select: {
                                    id: true,
                                    nameEs: true,
                                    nameEn: true,
                                },
                            },
                        },
                    },

                    appointmentAddons: {
                        include: {
                            addon: {
                                select: {
                                    id: true,
                                    nameEs: true,
                                    nameEn: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!customer) {
        return Response.json(
            { error: "Customer not found" },
            { status: 404 }
        );
    }

    return Response.json(customer);
}