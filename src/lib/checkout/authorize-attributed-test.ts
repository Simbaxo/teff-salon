
import { isAttributedCheckoutTestEnabled } from "./is-attributed-test-enabled";

type TestUser = {
    id?: string;
    role?: string;
    email?: string | null;
    name?: string | null;
};

// Restrict attributed checkout testing to one isolated OWNER.
// The expected identity comes from server environment variables.
export function authorizeAttributedCheckoutTest(
    user: TestUser | undefined
): boolean {
    if (!isAttributedCheckoutTestEnabled()) {
        return false;
    }

    if (!user || user.role !== "OWNER") {
        return false;
    }

    const expectedId = process.env.TEFF_CHECKOUT_TEST_OWNER_ID;
    const expectedMarker = process.env.TEFF_CHECKOUT_TEST_MARKER;

    if (
        !expectedId ||
        !/^[1-9]\d*$/.test(expectedId) ||
        !expectedMarker ||
        !/^teff-checkout-[0-9a-f-]{36}$/.test(expectedMarker)
    ) {
        return false;
    }

    return (
        user.id === expectedId &&
        user.name === expectedMarker &&
        user.email === `${expectedMarker}@example.invalid`
    );
}


type FixtureAppointment = {
    id: number;
    customerId: number;
    bookingId: number | null;
};

// Restrict test checkout to the exact two fixture appointments.
// The expected IDs come from server configuration, never the browser.
export function authorizeAttributedFixtureAppointments(
    appointmentIds: number[],
    appointments: FixtureAppointment[]
): boolean {
    if (!isAttributedCheckoutTestEnabled()) {
        return false;
    }

    const expectedIdsRaw =
        process.env.TEFF_CHECKOUT_TEST_APPOINTMENT_IDS;

    const expectedCustomerId =
        Number(process.env.TEFF_CHECKOUT_TEST_CUSTOMER_ID);

    const expectedBookingId =
        Number(process.env.TEFF_CHECKOUT_TEST_BOOKING_ID);

    if (!expectedIdsRaw) {
        return false;
    }

    const expectedIds = expectedIdsRaw.split(",").map(Number);

    // Require exactly two distinct, positive appointment IDs.
    if (
        expectedIds.length !== 2 ||
        expectedIds.some(
            (id) => !Number.isSafeInteger(id) || id <= 0
        ) ||
        new Set(expectedIds).size !== 2 ||
        !Number.isSafeInteger(expectedCustomerId) ||
        expectedCustomerId <= 0 ||
        !Number.isSafeInteger(expectedBookingId) ||
        expectedBookingId <= 0
    ) {
        return false;
    }

    const expected = new Set(expectedIds);

    // Reject extra, missing, or duplicate appointments.
    if (
        appointmentIds.length !== 2 ||
        appointments.length !== 2 ||
        new Set(appointmentIds).size !== 2 ||
        new Set(appointments.map((item) => item.id)).size !== 2
    ) {
        return false;
    }

    return (
        appointmentIds.every((id) => expected.has(id)) &&
        appointments.every(
            (appointment) =>
                expected.has(appointment.id) &&
                appointment.customerId === expectedCustomerId &&
                appointment.bookingId === expectedBookingId
        )
    );
}
