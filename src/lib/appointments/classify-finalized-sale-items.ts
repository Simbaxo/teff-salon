import {
    getFinalizedAppointmentItems,
    type FinalizedAppointmentItem,
} from "./get-finalized-appointment-items";

type AppointmentReference = {
    id: number;
    employeeId: number;
    customer: {
        id: number;
    };
};

type SaleReference = {
    lineItems: FinalizedAppointmentItem[];
    saleAppointments: {
        appointment: {
            id: number;
            customerId: number;
        };
    }[];
};

export function classifyFinalizedSaleItems(
    sale: SaleReference,
    appointments: readonly AppointmentReference[]
) {
    const linkedAppointmentIds = new Set(
        sale.saleAppointments.map(
            (link) => link.appointment.id
        )
    );

    const relevantAppointments = appointments.filter(
        (appointment) =>
            linkedAppointmentIds.has(appointment.id)
    );

    // Build a map of safely assigned items.
    const assignments = new Map<number, number[]>();

    for (const appointment of relevantAppointments) {
        const items = getFinalizedAppointmentItems(
            appointment,
            sale
        );

        for (const item of items) {
            const owners = assignments.get(item.id) ?? [];

            if (!owners.includes(appointment.id)) {
                owners.push(appointment.id);
            }

            assignments.set(item.id, owners);
        }
    }

    const assignedItems: {
        appointmentId: number;
        item: FinalizedAppointmentItem;
    }[] = [];

    const unassignedItems: FinalizedAppointmentItem[] = [];

    for (const item of sale.lineItems) {
        const owners = assignments.get(item.id) ?? [];

        // Assign only when exactly one appointment qualifies.
        if (owners.length === 1) {
            assignedItems.push({
                appointmentId: owners[0],
                item,
            });
        } else {
            // Includes legacy, ambiguous and unmatched items.
            unassignedItems.push(item);
        }
    }

    return {
        assignedItems,
        unassignedItems,
    };
}