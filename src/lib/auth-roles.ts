export type TeffUserRole =
    | "OWNER"
    | "RECEPTIONIST"
    | "TECHNICIAN"

// Roles allowed to manage normal staff operations
export function canManageStaff(role: TeffUserRole) {
    return role === "OWNER" || role === "RECEPTIONIST";
}

// Roles allowed to complete checkout
export function canCheckout(role: TeffUserRole) {
    return role === "OWNER" || role === "RECEPTIONIST";
}