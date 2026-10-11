
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
