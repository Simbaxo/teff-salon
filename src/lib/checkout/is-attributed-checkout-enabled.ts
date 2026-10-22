
import { canCheckout } from "@/lib/auth-roles";
import type { TeffUserRole } from "@/lib/auth-roles";

// Production feature switch for service-level technician attribution.
// Disabled unless explicitly enabled in the server environment.
export function isAttributedCheckoutEnabled(
    role: TeffUserRole | undefined
): boolean {
    // Never enable the Production authorization path in Development.
    if (
        process.env.NODE_ENV !== "production" ||
        process.env.TEFF_ATTRIBUTED_CHECKOUT_ENABLED !== "true"
    ) {
        return false;
    }

    if (!role) {
        return false;
    }

    // Only authorized checkout roles can use this feature.
    return canCheckout(role);
}