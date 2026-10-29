
type BookingAppointment = {
    id: number;
    bookingId: number | null;
};

// Every Booking represents one salon visit.
// Legacy appointments without a booking remain independent.
export function getReceptionBookingKey(
    appointment: BookingAppointment
): string {
    return appointment.bookingId !== null
        ? `booking-${appointment.bookingId}`
        : `appointment-${appointment.id}`;
}

// Count customer bookings, not individual service blocks.
export function countReceptionBookings<
    T extends BookingAppointment
>(
    appointments: readonly T[]
): number {
    return new Set(
        appointments.map(getReceptionBookingKey)
    ).size;
}

// Keep appointments from the same booking together.
// Different bookings by the same customer remain separate.
export function groupReceptionBookings<
    T extends BookingAppointment & {
        customer: {
            id: number;
            name: string;
        };
    }
>(
    appointments: readonly T[]
) {
    const groups = new Map<string, T[]>();

    for (const appointment of appointments) {
        const key = getReceptionBookingKey(appointment);

        const existing = groups.get(key);

        if (existing) {
            existing.push(appointment);
        } else {
            groups.set(key, [appointment]);
        }
    }

    return Array.from(groups, ([groupKey, items]) => ({
        groupKey,
        customerId: items[0].customer.id,
        customer: items[0].customer,
        appointments: items,
    }));
}