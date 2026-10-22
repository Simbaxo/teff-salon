
import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "./types";

type CheckoutValidationContext = {
    // Appointment IDs already verified as belonging to this visit.
    appointmentIds: number[];

    // Original appointment-service relationships verified by the server.
    bookedServices: {
        appointmentId: number;
        serviceId: number;
        employeeId: number;
    }[];

    // Technician IDs verified as active by the server.
    activeEmployeeIds: number[];

    // Service qualifications loaded from EmployeeService.
    employeeServices: {
        employeeId: number;
        serviceId: number;
    }[];

    // Valid add-on relationships loaded from ServiceAddon.
    serviceAddons: {
        serviceId: number;
        addonId: number;
    }[];
};

// Validate submitted assignments against server-provided reference data.
export function validateCheckoutAssignments(
    services: CheckoutServiceAssignment[],
    addons: CheckoutAddonAssignment[],
    context: CheckoutValidationContext
): void {
    if (!Array.isArray(services) || services.length === 0) {
        throw new Error("Checkout requires at least one service");
    }

    // Prevent duplicate financial attribution for the same service.
    // The same service may appear on different appointment blocks.
    const assignmentKeys = new Set<string>();

    for (const service of services) {
        const key = `${service.appointmentId ?? "NEW"}:${service.serviceId}`;

        if (assignmentKeys.has(key)) {
            throw new Error("Duplicate checkout service assignment");
        }

        assignmentKeys.add(key);
    }

    // Validate each individual service assignment.
    for (const service of services) {
        if (
            !Number.isSafeInteger(service.serviceId) ||
            service.serviceId <= 0 ||
            !Number.isSafeInteger(service.employeeId) ||
            service.employeeId <= 0 ||
            !Number.isSafeInteger(service.price) ||
            service.price < 0
        ) {
            throw new Error("Invalid checkout service assignment");
        }

        if (
            service.appointmentId !== null &&
            (
                !Number.isSafeInteger(service.appointmentId) ||
                !context.appointmentIds.includes(service.appointmentId)
            )
        ) {
            throw new Error("Service appointment does not belong to this visit");
        }

        if (service.appointmentId !== null) {
            // Confirm the service was originally booked on this appointment.
            const bookedService = context.bookedServices.find(
                (item) =>
                    item.appointmentId === service.appointmentId &&
                    item.serviceId === service.serviceId
            );

            if (!bookedService) {
                throw new Error(
                    "Service was not booked on the specified appointment"
                );
            }
        }

        // Prevent a booked service from bypassing appointment ownership.
        if (
            service.appointmentId === null &&
            context.bookedServices.some(
                (item) => item.serviceId === service.serviceId
            )
        ) {
            throw new Error(
                "Existing booked service must reference its appointment"
            );
        }

        if (!context.activeEmployeeIds.includes(service.employeeId)) {
            throw new Error("Inactive or unknown technician");
        }

        const qualified = context.employeeServices.some(
            (relation) =>
                relation.employeeId === service.employeeId &&
                relation.serviceId === service.serviceId
        );

        if (!qualified) {
            throw new Error("Technician is not qualified for service");
        }
    }

    if (!Array.isArray(addons)) {
        throw new Error("Invalid checkout add-ons");
    }

    for (const addon of addons) {
        if (
            !Number.isSafeInteger(addon.addonId) ||
            addon.addonId <= 0 ||
            !Number.isSafeInteger(addon.price) ||
            addon.price < 0 ||
            !Number.isSafeInteger(addon.serviceIndex) ||
            addon.serviceIndex < 0 ||
            addon.serviceIndex >= services.length
        ) {
            throw new Error("Invalid checkout add-on assignment");
        }

        const parentService = services[addon.serviceIndex];

        const allowed = context.serviceAddons.some(
            (relation) =>
                relation.serviceId === parentService.serviceId &&
                relation.addonId === addon.addonId
        );

        if (!allowed) {
            throw new Error("Add-on is not allowed for selected service");
        }
    }
}