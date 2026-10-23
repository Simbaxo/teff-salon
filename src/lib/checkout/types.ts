
/**
 * A service selected during checkout.
 * Existing services retain their appointment ID.
 * Newly added services have no appointment ID yet.
 */
export type CheckoutServiceAssignment = {
    serviceId: number;
    appointmentId: number | null;
    employeeId: number;
    price: number;
};

/**
 * An add-on belongs to a specific selected service.
 *
 * addonId identifies the catalog item.
 * instanceId identifies an individual selected occurrence.
 * serviceIndex identifies its parent service.
 *
 * instanceId remains optional for existing checkout requests.
 */
export type CheckoutAddonAssignment = {
    instanceId?: string;
    addonId: number;
    serviceIndex: number;
    price: number;
};

/**
 * The technician's revenue is calculated from validated
 * service and add-on assignments.
 */
export type CheckoutRevenueItem = {
    employeeId: number;
    price: number;
};