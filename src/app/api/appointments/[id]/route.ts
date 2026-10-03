import { prisma } from "@/lib/prisma"
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string}> }
) {
    try {

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

        const { id } = await context.params;
        const appointmentId = Number(id);

        if (!appointmentId) {
            return Response.json(
                { error: "Invalid appointment ID" },
                { status: 400 }
            );
        }

        const appointment = await prisma.appointment.findUnique({
            where: {
                id: appointmentId,
            },
            include: {
                customer: true,
                employee: true,
                appointmentServices: {
                    include: {
                        service: true,
                    },
                },
                appointmentAddons: {
                    include: {
                        addon: true,
                    },
                },
            },
        });

        if (!appointment) {
            return Response.json(
                { error: "Appointment not found" },
                { status: 404 }
            );
        }

        return Response.json(appointment);
    } catch (error) {
        console.error("Failed to load appointment:", error );

        return Response.json(
            { error: "Unable to load appointment" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
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

        const { id } = await context.params;
        const appointmentId = Number(id);

        if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
            return Response.json(
                { error: "Invalid appointment ID" },
                { status: 400 }
            );
        }

        const appointment = await prisma.appointment.findUnique({
            where: {
                id: appointmentId,
            },
            select: {
                id: true,
                bookingId: true,
                saleAppointments: {
                    select: {
                        saleId: true,
                    },
                },
            },
        });

        if (!appointment) {
            return Response.json(
                { error: "Appointment not found" },
                { status: 404 }
            );
        }

        // Never delete appointments that are already part of a completed sale.
        // This protects revenue, payment, commission, and checkout history.
        if (appointment.saleAppointments.length > 0) {
            return Response.json(
                {
                    error:
                        "This appointment is connected to a sale and cannot be deleted",
                },
                { status: 409 }
            );
        }

        await prisma.$transaction(async (tx) => {
            await tx.appointmentAddon.deleteMany({
                where: {
                    appointmentId,
                },
            });

            await tx.appointmentService.deleteMany({
                where: {
                    appointmentId,
                },
            });

            await tx.appointment.delete({
                where: {
                    id: appointmentId,
                },
            });

            // Remove an empty booking after its final appointment is deleted.
            if (appointment.bookingId) {
                const remainingAppointments = await tx.appointment.count({
                    where: {
                        bookingId: appointment.bookingId,
                    },
                });

                if (remainingAppointments === 0) {
                    await tx.booking.delete({
                        where: {
                            id: appointment.bookingId,
                        },
                    });
                }
            }
        });

        return Response.json({
            success: true,
            deletedAppointmentId: appointmentId,
        });
    } catch (error) {
        console.error("Failed to delete appointment:", error);

        return Response.json(
            { error: "Unable to delete appointment" },
            { status: 500 }
        );
    }
}