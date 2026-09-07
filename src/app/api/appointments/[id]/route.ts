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