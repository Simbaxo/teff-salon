import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { assertAppointmentNotSold } from "@/lib/appointments/reassignment-safety";
import { getReassignmentErrorResponse } from "@/lib/appointments/reassignment-errors";

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

        const maxAttempts = 3;
        let result = null;

        for (let attempt =1; attempt <= maxAttempts; attempt++) {
            try {
                result = await prisma.$transaction(
                    async (tx) => {
                        // Serialize reassignment with payroll operations
                        // before checking schedule or financial records.
                        const serviceMonday = new Date(appointment.date);

                        const weekday = serviceMonday.getUTCDay();

                        const daysSinceMonday =
                            weekday === 0 ? 6 : weekday - 1;

                        serviceMonday.setUTCDate(
                            serviceMonday.getUTCDate() - daysSinceMonday
                        );

                        await lockPayrollWeek(tx, serviceMonday);

                        // Reload the appointment after acquiring the payroll lock.
                        // Do not rely on appointment details read before the transaction.
                        const currentAppointment =
                            await tx.appointment.findUnique({
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
                                    appointmentServices: {
                                        select: {
                                            serviceId: true,
                                        },
                                    },
                                },
                            });

                        if (!currentAppointment) {
                            throw new Error("APPOINTMENT_NOT_FOUND");
                        }

                        // Recheck receptionist permissions using current status.
                        // A service may have started after the initial request.
                        if (
                            session.user.role === "RECEPTIONIST" &&
                            !["REQUESTED", "BOOKED", "CHECKED_IN"].includes(
                                currentAppointment.status
                            )
                        ) {
                            throw new Error("REASSIGNMENT_STATUS_FORBIDDEN");
                        }

                        // If the appointment moved to another service date,
                        // retry with a fresh request instead of using the old week.
                        if (
                            currentAppointment.date.getTime() !==
                            appointment.date.getTime()
                        ) {
                            throw new Error("APPOINTMENT_CHANGED");
                        }

                        // Verify the technician is qualified for the
                        // appointment's current services, not stale data.
                        const currentEmployee =
                            await tx.employee.findUnique({
                                where: {
                                    id: employeeId,
                                },
                                select: {
                                    active: true,
                                    employeeServices: {
                                        select: {
                                            serviceId: true,
                                        },
                                    },
                                },
                            });

                        if (!currentEmployee?.active) {
                            throw new Error("REASSIGNMENT_EMPLOYEE_INVALID");
                        }

                        const qualifiedServiceIds = new Set(
                            currentEmployee.employeeServices.map(
                                (item) => item.serviceId
                            )
                        );

                        const qualifiedForCurrentServices =
                            currentAppointment.appointmentServices.every(
                                (item) =>
                                    qualifiedServiceIds.has(item.serviceId)
                            );

                        if (!qualifiedForCurrentServices) {
                            throw new Error("REASSIGNMENT_EMPLOYEE_INVALID");
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

                        // Prevent technician changes after payroll has been reviewed
                        // This protects the approved commission and tip ownership
                        if (saleAppointment) {
                            const lockedPayroll = await tx.payrollEntry.findFirst({
                                where: {
                                    period: {
                                        status: {
                                            in: ["REVIEWED", "PAID"],
                                        },
                                    },
                                    OR: [
                                        {
                                            commissions: {
                                                some: {
                                                    saleId: saleAppointment.saleId,
                                                },
                                            },
                                        },
                                        {
                                            tips: {
                                                some: {
                                                    saleId: saleAppointment.saleId,
                                                },
                                            },
                                        },
                                    ],
                                },
                                select: {
                                    id: true,
                                },
                            });

                            if (lockedPayroll) {
                                throw new Error("PAYROLL_LOCKED");
                            }
                        }

                        // Also protect appointments belonging to a reviewed payroll week,
                        // even if no commission or tip has been assigned yet.
                        if (saleAppointment) {
                            // Use the appointment date verified inside this transaction.
                            const appointmentDate = currentAppointment.date
                                .toISOString()
                                .slice(0, 10);

                            const weekday = currentAppointment.date.getUTCDay();

                            const daysSinceMonday =
                                weekday === 0 ? 6 : weekday - 1;

                            const monday = new Date(
                                `${appointmentDate}T00:00:00.000Z`
                            );

                            monday.setUTCDate(
                                monday.getUTCDate() - daysSinceMonday
                            );

                            const lockedPeriod = await tx.payrollPeriod.findFirst({
                                where: {
                                    startDate: monday,
                                    status: {
                                        in: ["REVIEWED", "PAID"],
                                    },
                                },
                                select: {
                                    id: true,
                                },
                            });

                            if (lockedPeriod) {
                                throw new Error("PAYROLL_LOCKED");
                            }
                        }

                        // Preserve payroll-lock errors, then verify the sale relationship
                        // directly inside this transaction before changing the technician.
                        await assertAppointmentNotSold(tx, appointment.id);

                        // Check the current technician only after financial safeguards.
                        // A no-op must not bypass sold-appointment protection.
                        if (currentAppointment.employeeId === employeeId) {
                            return tx.appointment.findUniqueOrThrow({
                                where: {
                                    id: currentAppointment.id,
                                },
                                include: {
                                    employee: true,
                                },
                            });
                        }

                        // Only appointments that currently occupy the schedule need
                        // availability protection when changing technicians
                        const scheduleBlockingStatuses = [
                            "REQUESTED",
                            "BOOKED",
                            "CHECKED_IN",
                            "IN_PROGRESS",
                        ]

                        if (scheduleBlockingStatuses.includes(currentAppointment.status)) {
                            const existingAppointments = await tx.appointment.findMany({
                                where: {
                                    employeeId,
                                    date: currentAppointment.date,

                                    // Never let the appointment conflict with itself
                                    id: {
                                        not: currentAppointment.id,
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
                                        date: currentAppointment.date
                                    },
                                });

                            // Convert "10:30" into minutes from midnight
                            function timeToMinutes(time: string) {
                                const [hours, minutes] = time.split(":").map(Number);
                                return hours * 60 + minutes;
                            }

                            const requestedStart = timeToMinutes(currentAppointment.startTime);
                            const requestedEnd =
                                requestedStart + currentAppointment.duration;

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

                        // Update only if the appointment still matches
                        // the details validated inside this transaction.
                        const updateResult = await tx.appointment.updateMany({
                            where: {
                                id: currentAppointment.id,
                                employeeId: currentAppointment.employeeId,
                                status: currentAppointment.status,
                                date: currentAppointment.date,
                                startTime: currentAppointment.startTime,
                                duration: currentAppointment.duration,
                            },
                            data: {
                                employeeId,
                            },
                        });

                        if (updateResult.count !== 1) {
                            throw new Error("APPOINTMENT_CHANGED");
                        }

                        // Return the updated appointment with its technician.
                        return tx.appointment.findUniqueOrThrow({
                            where: {
                                id: currentAppointment.id,
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
               // Business-rule errors should not be retried.
                if (
                    error instanceof Error &&
                    (
                        error.message === "REASSIGNMENT_APPOINTMENT_CONFLICT" ||
                        error.message === "REASSIGNMENT_BLOCK_CONFLICT" ||
                        error.message === "PAYROLL_LOCKED" ||
                        error.message === "SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED" ||
                        error.message === "APPOINTMENT_CHANGED" ||
                        error.message === "REASSIGNMENT_EMPLOYEE_INVALID" ||
                        error.message === "REASSIGNMENT_STATUS_FORBIDDEN"
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
        // Convert known business-rule errors into their HTTP responses.
        const knownError = getReassignmentErrorResponse(error);

        if (knownError) {
            return Response.json(
                knownError.body,
                { status: knownError.status }
            );
        }

        // Unexpected errors must not expose internal database details.
        console.error(
            "Failed to reassign appointment technician:",
            error
        );

        return Response.json(
            {
                error: "Unable to reassign appointment technician",
            },
            { status: 500 }
        );
    }
}