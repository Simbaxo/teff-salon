
import type { Prisma } from "@/generated/prisma/client";

import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "./types";

// Load trusted reference data using the active checkout transaction.
// The caller must already have acquired the required financial locks.
export async function loadCheckoutAssignmentContext(
    tx: Prisma.TransactionClient,
    input: {
        appointmentIds: number[];
        services: CheckoutServiceAssignment[];
        addons: CheckoutAddonAssignment[];
    }
) {
    const { appointmentIds, services, addons } = input;

    const serviceIds = [
        ...new Set(services.map((item) => item.serviceId)),
    ];

    const employeeIds = [
        ...new Set(services.map((item) => item.employeeId)),
    ];

    // Load booked services from the database, not the browser.
    const bookedServices = await tx.appointmentService.findMany({
        where: {
            appointmentId: { in: appointmentIds },
        },
        select: {
            appointmentId: true,
            serviceId: true,
            appointment: {
                select: {
                    employeeId: true,
                },
            },
        },
    });

    // Confirm selected technicians are active.
    const employees = await tx.employee.findMany({
        where: {
            id: { in: employeeIds },
            active: true,
        },
        select: {
            id: true,
        },
    });

    // Load qualifications for the selected technicians and services.
    const employeeServices = await tx.employeeService.findMany({
        where: {
            employeeId: { in: employeeIds },
            serviceId: { in: serviceIds },
        },
        select: {
            employeeId: true,
            serviceId: true,
        },
    });

    // Load valid add-on relationships for selected services.
    const serviceAddons = await tx.serviceAddon.findMany({
        where: {
            serviceId: { in: serviceIds },
            addonId: {
                in: [...new Set(addons.map((item) => item.addonId))],
            },
        },
        select: {
            serviceId: true,
            addonId: true,
        },
    });

    return {
        appointmentIds,
        bookedServices: bookedServices.map((item) => ({
            appointmentId: item.appointmentId,
            serviceId: item.serviceId,
            employeeId: item.appointment.employeeId,
        })),
        activeEmployeeIds: employees.map((item) => item.id),
        employeeServices,
        serviceAddons,
    };
}