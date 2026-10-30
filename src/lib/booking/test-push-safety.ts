
type BookingPushEnvironment = {
    NODE_ENV?: string;
    DATABASE_URL?: string;
    TEFF_BOOKING_TEST_DISABLE_PUSH?: string;
};

const approvedDevelopmentEndpoint =
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

export function shouldSuppressBookingPush(
    environment: BookingPushEnvironment
): boolean {
    if (
        environment.TEFF_BOOKING_TEST_DISABLE_PUSH !== "true"
    ) {
        return false;
    }

    if (environment.NODE_ENV !== "development") {
        throw new Error(
            "Unsafe booking notification test environment"
        );
    }

    if (!environment.DATABASE_URL) {
        throw new Error(
            "Missing booking test database configuration"
        );
    }

    let endpoint: string;

    try {
        endpoint = new URL(
            environment.DATABASE_URL
        ).hostname.replace(/-pooler(?=\.)/, "");
    } catch {
        throw new Error(
            "Invalid booking test database configuration"
        );
    }

    if (endpoint !== approvedDevelopmentEndpoint) {
        throw new Error(
            "Booking notification suppression requires Neon Development"
        );
    }

    return true;
}