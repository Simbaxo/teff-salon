
type AppointmentReference = {
    appointment: {
        employeeId: number;
        date: Date;
    };
};

// Confirm that the technician performed work
// during the selected Monday–Sunday payroll period.
export function workedInPayrollPeriod(
    employeeId: number,
    appointments: AppointmentReference[],
    serviceStart: Date,
    serviceEnd: Date
): boolean {
    return appointments.some(
        ({ appointment }) =>
            appointment.employeeId === employeeId &&
            appointment.date >= serviceStart &&
            appointment.date < serviceEnd
    );
}

// Check whether a financial record has a valid
// technician and service-date attribution.
export function hasValidPayrollAttribution(
    record: {
        employeeId: number;
        sale: {
            saleAppointments: AppointmentReference[];
        };
    },
    serviceStart: Date,
    serviceEnd: Date
): boolean {
    return workedInPayrollPeriod(
        record.employeeId,
        record.sale.saleAppointments,
        serviceStart,
        serviceEnd
    );
}


type CommissionAttributionRecord = {
    employeeId: number;
    commissionBase: number;
    sale: {
        saleAppointments: AppointmentReference[];
        lineItems: {
            employeeId: number | null;
            unitPrice: number;
        }[];
    };
};

export function hasValidCommissionPayrollAttribution(
    record: CommissionAttributionRecord,
    serviceStart: Date,
    serviceEnd: Date
): boolean {
    const appointments = record.sale.saleAppointments;

    // A commission must belong to a sale with an appointment
    // during the selected payroll week.
    const hasServiceThisWeek = appointments.some(
        ({ appointment }) =>
            appointment.date >= serviceStart &&
            appointment.date < serviceEnd
    );

    if (!hasServiceThisWeek) {
        return false;
    }

    const attributedItems = record.sale.lineItems.filter(
        (item) => item.employeeId !== null
    );

    // Legacy sales have no technician-attributed line items.
    // Preserve the original appointment-based validation.
    if (attributedItems.length === 0) {
        return hasValidPayrollAttribution(
            record,
            serviceStart,
            serviceEnd
        );
    }

    // A partially attributed sale requires investigation.
    // Never silently accept missing technician assignments.
    if (
        attributedItems.length !== record.sale.lineItems.length
    ) {
        return false;
    }

    // Modern sales use finalized checkout attribution.
    const attributedRevenue = attributedItems
        .filter(
            (item) => item.employeeId === record.employeeId
        )
        .reduce(
            (total, item) => total + item.unitPrice,
            0
        );

    return (
        Number.isSafeInteger(record.commissionBase) &&
        record.commissionBase >= 0 &&
        Number.isSafeInteger(attributedRevenue) &&
        attributedRevenue > 0 &&
        record.commissionBase <= attributedRevenue
    );
}

import { getTeffDayOfWeek } from "@/lib/datetime";

export function validatePayrollWeek(
    value: unknown
): Date | null {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value ||
        getTeffDayOfWeek(value) !== 1
    ) {
        return null;
    }

    return date;
}

type PayrollSaleRecord = {
    sale: {
        saleAppointments: {
            appointment: {
                date: Date;
            };
        }[];
    };
};

// Reject sales containing services outside the selected payroll week.
export function saleSpansPayrollWeeks(
    record: PayrollSaleRecord,
    serviceStart: Date,
    serviceEnd: Date
): boolean {
    return record.sale.saleAppointments.some(
        ({ appointment }) =>
            appointment.date < serviceStart ||
            appointment.date >= serviceEnd
    );
}