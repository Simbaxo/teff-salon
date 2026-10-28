import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { calculateLifetimeSpend } from "@/lib/customers/calculate-lifetime-spend";
import { groupCustomerVisits } from "@/lib/customers/group-customer-visits";

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

                    // Include completed checkout records connected to this appointment
                    saleAppointments: {
                        include: {
                            sale: {
                                select: {
                                    id: true,
                                    subtotal: true,
                                    discountTotal: true,
                                    finalTotal: true,
                                    createdAt: true,
                                    saleAppointments: {
                                        select: {
                                            appointment: {
                                                select: {
                                                    customerId: true,
                                                },
                                            },
                                        },
                                    },
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

    // Calculate simple customer history metrics
    const completedAppointments = customer.appointments.filter(
        (appointment) => appointment.status === "COMPLETED"
    );

    // Count completed salon visits rather than individual service blocks.
    const completedVisitCount = groupCustomerVisits(
        completedAppointments
    ).length;

    const noShows = customer.appointments.filter(
        (appointment) => appointment.status === "NO_SHOW"
    );

    // Count finalized sales once and verify customer ownership.
    const {
        lifetimeSpend,
        ambiguousSaleIds,
    } = calculateLifetimeSpend(
        customerId,
        completedAppointments
    );

    const lastVisit =
        completedAppointments.length > 0
        ? completedAppointments[0].date
        : null;

    return Response.json({
        customer,
        summary: {
            completedVisits: completedVisitCount,
            noShows: noShows.length,
            lifetimeSpend,
            ambiguousSaleIds,
            lastVisit,
        },
    });
}