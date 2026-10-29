
type FinalizedSale = {
    id: number;
    finalTotal: number;
    lineItems: {
        id: number;
        itemType: string;
        itemName: string;
        unitPrice: number;
        employeeId: number | null;
        appointmentId: number | null;
        parentLineItemId: number | null;
    }[];
    saleAppointments: {
        appointment: {
            id: number;
            customerId: number;
        };
    }[];
};

type AppointmentWithSale = {
    id: number;
    status: string;
    saleAppointments: {
        sale: FinalizedSale;
    }[];
};

// Collect each finalized sale only once across all appointment blocks.
// The caller supplies appointments for the selected agenda date.
export function getUniqueFinalizedSales<
    T extends AppointmentWithSale
>(appointments: readonly T[]): FinalizedSale[] {
    const sales = new Map<number, FinalizedSale>();

    for (const appointment of appointments) {
        if (appointment.status !== "COMPLETED") {
            continue;
        }

        for (const link of appointment.saleAppointments) {
            const sale = link.sale;

            if (!sales.has(sale.id)) {
                sales.set(sale.id, sale);
            }
        }
    }

    return [...sales.values()];
}