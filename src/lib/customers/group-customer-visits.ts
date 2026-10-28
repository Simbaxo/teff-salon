
export type VisitAppointment = {
    id: number;
    bookingId: number | null;
    status: string;
    saleAppointments: {
        sale: {
            id: number;
            finalTotal: number;
        };
    }[];
};

export type CustomerVisitGroup<T extends VisitAppointment> = {
    key: string;
    saleId: number | null;
    bookingId: number | null;
    appointments: T[];
};

export function groupCustomerVisits<T extends VisitAppointment>(
    appointments: T[]
): CustomerVisitGroup<T>[] {
    const groups = new Map<string, CustomerVisitGroup<T>>();

    for (const appointment of appointments) {
        const saleId =
            appointment.status === "COMPLETED"
                ? appointment.saleAppointments[0]?.sale.id ?? null
                : null;

        const key =
            saleId !== null
                ? `sale:${saleId}`
                : appointment.bookingId !== null
                    ? `booking:${appointment.bookingId}`
                    : `appointment:${appointment.id}`;

        let group = groups.get(key);

        if (!group) {
            group = {
                key,
                saleId,
                bookingId: appointment.bookingId,
                appointments: [],
            };

            groups.set(key, group);
        }

        group.appointments.push(appointment);
    }

    return [...groups.values()];
}