
type CheckoutServiceRevenue = {
    employeeId: number;
    price: number;
};

type CheckoutCommission = {
    employeeId: number;
    commissionBase: number;
    commissionRate: number;
    commissionAmount: number;
};

// Calculate technician commissions after distributing the sale discount.
export function calculateCheckoutCommissions(
    services: CheckoutServiceRevenue[],
    discountTotal: number
): CheckoutCommission[] {
    const commissionRate = 50;

    // Validate amounts before performing financial calculations.
    if (
        !Number.isSafeInteger(discountTotal) ||
        discountTotal < 0 ||
        services.some(
            (service) =>
                !Number.isSafeInteger(service.employeeId) ||
                service.employeeId <= 0 ||
                !Number.isSafeInteger(service.price) ||
                service.price < 0
        )
    ) {
        throw new Error("Invalid checkout commission input");
    }

    const revenueByEmployee = new Map<number, number>();

    for (const service of services) {
        const previous =
            revenueByEmployee.get(service.employeeId) ?? 0;

        const next = previous + service.price;

        if (!Number.isSafeInteger(next)) {
            throw new Error("Invalid checkout commission input");
        }

        revenueByEmployee.set(service.employeeId, next);
    }

    const subtotal = [...revenueByEmployee.values()].reduce(
        (total, amount) => total + amount,
        0
    );

    if (
        !Number.isSafeInteger(subtotal) ||
        discountTotal > subtotal
    ) {
        throw new Error("Invalid checkout discount");
    }

    let remainingDiscount = discountTotal;

    const employees = [...revenueByEmployee.entries()];

    return employees.map(([employeeId, revenue], index) => {
        // Give the final technician any remaining rounding difference.
        const isLast = index === employees.length - 1;

        const allocatedDiscount = isLast
            ? remainingDiscount
            : Math.min(
                  revenue,
                  remainingDiscount,
                  Math.round(
                      discountTotal * (revenue / subtotal)
                  )
              );

        remainingDiscount -= allocatedDiscount;

        const commissionBase = revenue - allocatedDiscount;

        return {
            employeeId,
            commissionBase,
            commissionRate,
            commissionAmount: Math.round(
                commissionBase * (commissionRate / 100)
            ),
        };
    });
}