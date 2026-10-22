
export type AssignmentPayloadError = {
    status: number;
    body: {
        error: string;
        conflictType: string;
    };
};

export function getAssignmentPayloadError(
    serviceAssignments: unknown,
    addonAssignments: unknown,
    allowAttributedTest = false
): AssignmentPayloadError | null {
    const hasServices = serviceAssignments !== undefined;
    const hasAddons = addonAssignments !== undefined;

    if (hasServices !== hasAddons) {
        return {
            status: 400,
            body: {
                error:
                    "La asignación de técnicas está incompleta. Actualiza la página e inténtalo nuevamente.",
                conflictType: "INCOMPLETE_ASSIGNMENTS",
            },
        };
    }

    if (!hasServices) {
        return null;
    }

    if (
        !Array.isArray(serviceAssignments) ||
        !Array.isArray(addonAssignments)
    ) {
        return {
            status: 400,
            body: {
                error:
                    "La información de asignación de técnicas no es válida.",
                conflictType: "INVALID_ASSIGNMENTS",
            },
        };
    }

    // Only the checkout API may authorize isolated test assignments.
    // Missing authorization always preserves the disabled behavior.
    if (allowAttributedTest) {
        return null;
    }

    // Fail closed until the new commission calculation is implemented.
    return {
        status: 409,
        body: {
            error:
                "La asignación de técnicas por servicio todavía no está disponible.",
            conflictType: "ASSIGNMENTS_NOT_ENABLED",
        },
    };
}