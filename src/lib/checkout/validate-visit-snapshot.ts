
type VisitSnapshot = {
    id: number;
    employeeId: number;
    bookingId: number | null;
    date: Date;
    status: string;
    startTime: string;
    duration: number;
    appointmentServices: {
        serviceId: number;
        bookedPrice: number;
    }[];
    appointmentAddons: {
        addonId: number;
        bookedPrice: number;
    }[];
};

// Compare unordered service and add-on selections.
function sameItems(
    original: string[],
    current: string[]
): boolean {
    return (
        original.length === current.length &&
        original.sort().every(
            (item, index) => item === current.sort()[index]
        )
    );
}

// Reject checkout when its financial inputs have changed.
export function assertCheckoutVisitUnchanged(
    original: VisitSnapshot[],
    current: VisitSnapshot[]
): void {
    if (original.length !== current.length) {
        throw new Error("CHECKOUT_VISIT_CHANGED");
    }

    const currentById = new Map(
        current.map((appointment) => [
            appointment.id,
            appointment,
        ])
    );

    for (const appointment of original) {
        const latest = currentById.get(appointment.id);

        if (
            !latest ||
            appointment.employeeId !== latest.employeeId ||
            appointment.bookingId !== latest.bookingId ||
            appointment.date.getTime() !== latest.date.getTime() ||
            appointment.status !== latest.status ||
            appointment.startTime !== latest.startTime ||
            appointment.duration !== latest.duration
        ) {
            throw new Error("CHECKOUT_VISIT_CHANGED");
        }

        const originalServices =
            appointment.appointmentServices.map(
                (item) => `${item.serviceId}:${item.bookedPrice}`
            );

        const currentServices =
            latest.appointmentServices.map(
                (item) => `${item.serviceId}:${item.bookedPrice}`
            );

        const originalAddons =
            appointment.appointmentAddons.map(
                (item) => `${item.addonId}:${item.bookedPrice}`
            );

        const currentAddons =
            latest.appointmentAddons.map(
                (item) => `${item.addonId}:${item.bookedPrice}`
            );

        if (
            !sameItems(originalServices, currentServices) ||
            !sameItems(originalAddons, currentAddons)
        ) {
            throw new Error("CHECKOUT_VISIT_CHANGED");
        }
    }
}