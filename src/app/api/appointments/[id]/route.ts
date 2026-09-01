import { prisma } from "@/lib/prisma"

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string}> }
) {
    try {
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
                { status: 400 }
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