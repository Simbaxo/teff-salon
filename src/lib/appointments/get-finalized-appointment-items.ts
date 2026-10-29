
export type FinalizedAppointmentItem = {
    id: number;
    itemType: string;
    itemName: string;
    unitPrice: number;
    employeeId: number | null;
    appointmentId: number | null;
    parentLineItemId: number | null;
};

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

export function getFinalizedAppointmentItems(
    appointment: AppointmentReference,
    sale: SaleReference
): FinalizedAppointmentItem[] {
    // Use the actual appointments linked to the sale.
    // Do not infer appointment ownership from line items.
    const linkedAppointments = sale.saleAppointments.map(
        (link) => link.appointment
    );

    const linkedAppointmentIds = new Set(
        linkedAppointments.map((item) => item.id)
    );

    const saleCustomerIds = new Set(
        linkedAppointments.map((item) => item.customerId)
    );

    const appointmentBelongsToSale =
        linkedAppointmentIds.has(appointment.id);

    if (!appointmentBelongsToSale) {
        return [];
    }

    const singleAppointmentSale =
        linkedAppointmentIds.size === 1;

    const singleCustomerSale =
        saleCustomerIds.size === 1 &&
        saleCustomerIds.has(appointment.customer.id);

    return sale.lineItems.filter((item) => {
        // Explicit appointment ownership takes priority.
        // Preserve the recorded checkout technician attribution.
        if (item.appointmentId !== null) {
            return item.appointmentId === appointment.id;
        }

        // Never invent ownership for legacy unattributed items.
        if (item.employeeId === null) {
            return false;
        }

        // An item added during checkout without an appointment link
        // can only be assigned when exactly one appointment belongs
        // to the sale and the recorded technician matches.
        return (
            singleAppointmentSale &&
            singleCustomerSale &&
            item.employeeId === appointment.employeeId
        );
    });
}