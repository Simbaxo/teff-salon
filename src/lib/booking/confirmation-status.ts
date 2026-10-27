
export type BookingConfirmationStatus =
    | "CONFIRMED"
    | "REQUESTED"
    | "MIXED"
    | "UNVERIFIED";

type AppointmentStatusInput = {
    status?: string | null;
};

export function getBookingConfirmationStatus(
    appointments: AppointmentStatusInput[],
    expectedServiceCount: number
): BookingConfirmationStatus {
    // Never confirm a booking with missing or incomplete data.
    if (
        expectedServiceCount <= 0 ||
        appointments.length !== expectedServiceCount
    ) {
        return "UNVERIFIED";
    }

    // Only recognize statuses explicitly supported by the booking API.
    if (
        appointments.some(
            (appointment) =>
                appointment.status !== "BOOKED" &&
                appointment.status !== "REQUESTED"
        )
    ) {
        return "UNVERIFIED";
    }

    if (
        appointments.every(
            (appointment) => appointment.status === "BOOKED"
        )
    ) {
        return "CONFIRMED";
    }

    if (
        appointments.every(
            (appointment) => appointment.status === "REQUESTED"
        )
    ) {
        return "REQUESTED";
    }

    return "MIXED";
}