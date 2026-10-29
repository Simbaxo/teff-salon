
type CustomerReference = {
    customerId: number;
    customer: {
        name: string;
    };
};

type SaleItemCustomerInput = {
    appointment: CustomerReference | null;
    sale: {
        saleAppointments: {
            appointment: CustomerReference;
        }[];
    };
};

export type ResolvedSaleItemCustomer =
    | {
          status: "RESOLVED";
          customerId: number;
          customerName: string;
      }
    | {
          status: "AMBIGUOUS" | "UNKNOWN";
          customerId: null;
          customerName: null;
      };

export function resolveSaleItemCustomer(
    item: SaleItemCustomerInput
): ResolvedSaleItemCustomer {
    // Prefer the appointment directly linked to this sale item.
    if (item.appointment) {
        return {
            status: "RESOLVED",
            customerId: item.appointment.customerId,
            customerName: item.appointment.customer.name,
        };
    }

    // Services added at checkout may not have an appointment link.
    const customers = new Map<number, string>();

    for (const link of item.sale.saleAppointments) {
        const appointment = link.appointment;

        customers.set(
            appointment.customerId,
            appointment.customer.name
        );
    }

    if (customers.size === 0) {
        return {
            status: "UNKNOWN",
            customerId: null,
            customerName: null,
        };
    }

    if (customers.size > 1) {
        return {
            status: "AMBIGUOUS",
            customerId: null,
            customerName: null,
        };
    }

    const [customerId, customerName] =
        [...customers.entries()][0];

    return {
        status: "RESOLVED",
        customerId,
        customerName,
    };
}