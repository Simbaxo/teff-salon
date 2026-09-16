import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";

export async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }>}
) {
    const session = await auth();

    // Only authenticated TEFF staff can reassign technicians
    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    // Only OWNER and RECEPTIONIST can access this operation
    if (!canManageStaff(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    try {
        const { id } = await context.params;
        const body = await request.json();

        const appointmentId = Number(id);
        const employeeId = Number(body.employeeId);

        // Both IDs must be positive integers
        if (
            !Number.isInteger(appointmentId) ||
            appointmentId <= 0 ||
            !Number.isInteger(employeeId) ||
            employeeId <= 0
        ) {
            return Response.json(
                { error: "Invalid appointment or employee ID" },
                { status: 400 }
            );
        }

        const appointment = await prisma.appointment.findUnique({
            where: {
                id: appointmentId,
            },
            select: {
                id: true,
                status: true,
                employeeId: true,
                date: true,
                startTime: true,
                duration: true,

                // We need every booked service to verify the new technician
                // is qualified to perform the complete appointment
                appointmentServices: {
                    select: {
                        serviceId: true,
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

        // Receptionist may only reassign appointments before service begins
        // Owners can correct the technician on appointments in any status
        const receptionistAllowedStatuses = [
            "REQUESTED",
            "BOOKED",
            "CHECKED_IN",
        ];

        if (
            session.user.role === "RECEPTIONIST" &&
            !receptionistAllowedStatuses.includes(appointment.status)
        ) {
            return Response.json(
                {
                    error: `Receptionist cannot reassign an appointment with status ${appointment.status}`,
                },
                { status: 403 }
            );
        }

            // Load the requested technician and their service qualifications
    const newEmployee = await prisma.employee.findUnique({
        where: {
            id: employeeId,
        },
        select: {
            id: true,
            name: true,
            active: true,
            employeeServices: {
                select: {
                    serviceId: true,
                },
            },
        },
    });

    if (!newEmployee) {
        return Response.json(
            { error: "Employee not found" },
            { status: 400 }
        );
    }

    if (!newEmployee.active) {
        return Response.json(
            { error: "Employee is not active" },
            { status: 400 }
        );
    }

    // A technician must be qualified for every service already booked
    const qualifiedServiceIds = new Set(
        newEmployee.employeeServices.map((item) => item.serviceId)
    );

    const isQualifiedForAllServices =
        appointment.appointmentServices.every((item) =>
            qualifiedServiceIds.has(item.serviceId)
        );

    if (!isQualifiedForAllServices) {
        return Response.json(
            {
                error: "Employee is not qualified for all appointment services",
            },
            { status: 400 }
        );
    }

        return Response.json({
            message: "Reassignment Validation Passed",
            appointmentId: appointment.id,
            currentEmployeeId: appointment.employeeId,
            newEmployeeId: employeeId,
        });
    } catch (error) {
        console.error("Failed to reassign appointment technician:", error)

        return Response.json(
            { error: "Unable to reassign appointment technician" },
            { status: 500 }
        );
    }
}