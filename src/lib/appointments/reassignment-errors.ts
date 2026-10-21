
type ReassignmentErrorResponse = {
    status: number;
    body: {
        error: string;
        conflictType?: string;
    };
};

// Convert known reassignment errors into HTTP response details.
// Keep this independent of authentication and database access.
export function getReassignmentErrorResponse(
    error: unknown
): ReassignmentErrorResponse | null {
    if (!(error instanceof Error)) {
        return null;
    }

    switch (error.message) {
        case "REASSIGNMENT_STATUS_FORBIDDEN":
            return {
                status: 403,
                body: {
                    error:
                        "No se puede cambiar la técnica porque el servicio ya comenzó o la cita fue finalizada.",
                    conflictType: "STATUS_FORBIDDEN",
                },
            };

        case "REASSIGNMENT_EMPLOYEE_INVALID":
            return {
                status: 409,
                body: {
                    error:
                        "La técnica ya no está activa o no está habilitada para todos los servicios de esta cita.",
                    conflictType: "EMPLOYEE_INVALID",
                },
            };

        case "APPOINTMENT_CHANGED":
            return {
                status: 409,
                body: {
                    error:
                        "La cita cambió mientras se procesaba la solicitud. Actualiza la página e inténtalo de nuevo.",
                    conflictType: "APPOINTMENT_CHANGED",
                },
            };

        case "SOLD_APPOINTMENT_REASSIGNMENT_BLOCKED":
            return {
                status: 409,
                body: {
                    error:
                        "Esta cita ya tiene una venta registrada. No se puede cambiar la técnica desde aquí.",
                    conflictType: "SOLD_APPOINTMENT",
                },
            };

        case "REASSIGNMENT_APPOINTMENT_CONFLICT":
            return {
                status: 409,
                body: {
                    error: "Appointment overlaps another appointment",
                    conflictType: "APPOINTMENT",
                },
            };

        case "REASSIGNMENT_BLOCK_CONFLICT":
            return {
                status: 409,
                body: {
                    error: "Employee has a schedule block during this time",
                    conflictType: "SCHEDULE_BLOCK",
                },
            };

        case "PAYROLL_LOCKED":
            return {
                status: 409,
                body: {
                    error:
                        "No se puede cambiar la técnica porque la nómina de esta fecha ya fue revisada o pagada.",
                    conflictType: "PAYROLL_LOCKED",
                },
            };

        case "REASSIGNMENT_CONFLICT":
            return {
                status: 409,
                body: {
                    error:
                        "Employee is not available for the full appointment time",
                },
            };

        default:
            return null;
    }
}