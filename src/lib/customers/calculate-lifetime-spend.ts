
type CustomerSale = {
    id: number;
    finalTotal: number;
    saleAppointments: {
        appointment: {
            customerId: number;
        };
    }[];
};

type CompletedAppointment = {
    saleAppointments: {
        sale: CustomerSale;
    }[];
};

export function calculateLifetimeSpend(
    customerId: number,
    completedAppointments: CompletedAppointment[]
): {
    lifetimeSpend: number;
    ambiguousSaleIds: number[];
} {
    const uniqueSales = new Map<number, CustomerSale>();

    for (const appointment of completedAppointments) {
        for (const link of appointment.saleAppointments) {
            const sale = link.sale;

            if (!uniqueSales.has(sale.id)) {
                uniqueSales.set(sale.id, sale);
            }
        }
    }

    let lifetimeSpend = 0;
    const ambiguousSaleIds: number[] = [];

    for (const sale of uniqueSales.values()) {
        const belongsExclusivelyToCustomer =
            sale.saleAppointments.length > 0 &&
            sale.saleAppointments.every(
                (link) =>
                    link.appointment.customerId === customerId
            );

        if (!belongsExclusivelyToCustomer) {
            ambiguousSaleIds.push(sale.id);
            continue;
        }

        lifetimeSpend += sale.finalTotal;
    }

    return {
        lifetimeSpend,
        ambiguousSaleIds,
    };
}