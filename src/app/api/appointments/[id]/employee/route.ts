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
        const overrideOverlap = body.overrideOverlap === true;

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

        // If the appointment is already assigned to this technician
        // there is nothing to change
        if (appointment.employeeId === employeeId) {
            return Response.json({
                message: "Appointment is already assigned to this employee",
                appointment,
            });
        }

        const maxAttempts = 3;
        let result = null;

        for (let attempt =1; attempt <= maxAttempts; attempt++) {
            try {
                result = await prisma.$transaction(
                    async (tx) => {
                        // Only appointments that currently occupy the schedule need
                        // availability protection when changing technicians
                        const scheduleBlockingStatuses = [
                            "REQUESTED",
                            "BOOKED",
                            "CHECKED_IN",
                            "IN_PROGRESS",
                        ]

                        if (scheduleBlockingStatuses.includes(appointment.status)) {
                            const existingAppointments = await tx.appointment.findMany({
                                where: {
                                    employeeId,
                                    date: appointment.date,
    
                                    // Never let the appointment conflict with itself
                                    id: {
                                        not: appointment.id,
                                    },
    
                                    status: {
                                        in: scheduleBlockingStatuses,
                                    },
                                },
                            });

                            const existingScheduleBlocks =
                                await tx.employeeScheduleBlock.findMany({
                                    where: {
                                        employeeId,
                                        date: appointment.date,
                                    },
                                });

                            // Convert "10:30" into minutes from midnight
                            function timeToMinutes(time: string) {
                                const [hours, minutes] = time.split(":").map(Number);
                                return hours * 60 + minutes;
                            }
                            
                            const requestedStart = timeToMinutes(appointment.startTime);
                            const requestedEnd =
                                requestedStart + appointment.duration;
                            
                            const hasConflict = existingAppointments.some(
                                (existingAppointment) => {
                                    const existingStart = timeToMinutes(
                                        existingAppointment.startTime
                                    );
    
                                    const existingEnd =
                                        existingStart + existingAppointment.duration;
                                    
                                    return (
                                        requestedStart < existingEnd &&
                                        requestedEnd > existingStart
                                    );
                                }
                            );

                            const hasScheduleBlockConflict =
                                existingScheduleBlocks.some(
                                    (scheduleBlock) => {
                                        const blockedStart = timeToMinutes(
                                            scheduleBlock.startTime
                                        );

                                        const blockedEnd = timeToMinutes(
                                            scheduleBlock.endTime
                                        );

                                        return (
                                            requestedStart < blockedEnd &&
                                            requestedEnd > blockedStart
                                        );
                                    }
                                );
    
                            // Schedule blocks such as vacation or late arrival cannot be overridden.
                            if (hasScheduleBlockConflict) {
                                throw new Error("REASSIGNMENT_BLOCK_CONFLICT");
                            }

                            // Staff may intentionally assign an overlapping appointment after confirmation.
                            if (hasConflict && !overrideOverlap) {
                                throw new Error("REASSIGNMENT_APPOINTMENT_CONFLICT");
                            }
                        }

                        // If this appointment has already been checked out, find its sale
                        // This matters when the Owner corrects a historical technician assignment
                        const saleAppointment = await tx.saleAppointment.findUnique({
                            where: {
                                appointmentId: appointment.id,
                            },
                            select: {
                                saleId: true,
                            },
                        });

                        // A completed sale may already have commission and tip records assigned
                        // to the original technician. Keep those records consistent with the correction
                        if (saleAppointment) {
                            await tx.commission.updateMany({
                                where: {
                                    saleId: saleAppointment.saleId,
                                    employeeId: appointment.employeeId,
                                },
                                data: {
                                    employeeId,
                                },
                            });

                            await tx.tip.updateMany({
                                where: {
                                    saleId: saleAppointment.saleId,
                                    employeeId: appointment.employeeId,
                                },
                                data: {
                                    employeeId,
                                },
                            });
                        }

                        // Change the technician assigned to the appointment
                        return tx.appointment.update({
                            where: {
                                id: appointment.id,
                            },
                            data: {
                                employeeId,
                            },
                            include: {
                                employee: true,
                            },
                        });
                    },
                    {
                        isolationLevel: "Serializable",
                    }
                );

                // Transaction Succeeded
                break;
            } catch (error) {
                if (
                    error instanceof Error &&
                    (
                        error.message === "REASSIGNMENT_APPOINTMENT_CONFLICT" ||
                        error.message === "REASSIGNMENT_BLOCK_CONFLICT"
                    )
                ) {
                    throw error;
                }

                // Retry when PostgreSQL detects a concurrent serialization conflict
                const isSerializableConflict =
                    typeof error === "object" &&
                    error !== null &&
                    "code" in error &&
                    error.code === "P2034";
                if (!isSerializableConflict) {
                    throw error;
                }

                if (attempt === maxAttempts) {
                    throw new Error("REASSIGNMENT_CONFLICT");
                }
            }
        }

        if (!result) {
            throw new Error("Unable to complete technician reassignment");
        }

        return Response.json(result);
    
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "REASSIGNMENT_APPOINTMENT_CONFLICT"
        ) {
            return Response.json(
                {
                    error: "Appointment overlaps another appointment",
                    conflictType: "APPOINTMENT",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "REASSIGNMENT_BLOCK_CONFLICT"
        ) {
            return Response.json(
                {
                    error: "Employee has a schedule block during this time",
                    conflictType: "SCHEDULE_BLOCK",
                },
                { status: 409 }
            );
        }
        if (
            error instanceof Error &&
            error.message === "REASSIGNMENT_CONFLICT"
            ) {
            return Response.json(
                {
                error:
                    "Employee is not available for the full appointment time",
                },
                { status: 409 }
            );
        }

        console.error("Failed to reassign appointment technician:", error)

        return Response.json(
            { error: "Unable to reassign appointment technician" },
            { status: 500 }
        );
    }
}