
export type BookingFixtureManifest = {
    marker: string;
    serviceDate: string;

    employeeIds: number[];
    serviceIds: number[];
    addonId: number;

    // Existing appointment used to simulate a busy technician.
    blockingCustomerId: number;
    blockingAppointmentId: number;

    // Records created by successful HTTP booking tests.
    // Initially empty; populated after each successful booking.
    bookingCustomerIds: number[];
    bookingIds: number[];
    appointmentIds: number[];
};

function validRecordIds(value: unknown): value is number[] {
    return (
        Array.isArray(value) &&
        value.every(
            (id) => Number.isSafeInteger(id) && id > 0
        ) &&
        new Set(value).size === value.length
    );
}

export function validateBookingFixtureManifest(
    value: unknown
): BookingFixtureManifest {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        throw new Error("Invalid booking fixture manifest");
    }

    const fixture = value as Record<string, unknown>;

    const validIds = (
        ids: unknown,
        expectedLength: number
    ): ids is number[] =>
        Array.isArray(ids) &&
        ids.length === expectedLength &&
        ids.every(
            (id) => Number.isSafeInteger(id) && id > 0
        ) &&
        new Set(ids).size === ids.length;

    if (
        typeof fixture.marker !== "string" ||
        !/^teff-booking-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            fixture.marker
        ) ||
        fixture.serviceDate !== "2099-01-05" ||
        !validIds(fixture.employeeIds, 2) ||
        !validIds(fixture.serviceIds, 2) ||
        !Number.isSafeInteger(fixture.addonId) ||
        Number(fixture.addonId) <= 0 ||
        !Number.isSafeInteger(fixture.blockingCustomerId) ||
        Number(fixture.blockingCustomerId) <= 0 ||
        !Number.isSafeInteger(fixture.blockingAppointmentId) ||
        Number(fixture.blockingAppointmentId) <= 0 ||
        !validRecordIds(fixture.bookingCustomerIds) ||
        !validRecordIds(fixture.bookingIds) ||
        !validRecordIds(fixture.appointmentIds)
    ) {
        throw new Error("Invalid booking fixture manifest");
    }

    return fixture as BookingFixtureManifest;
}