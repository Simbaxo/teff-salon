
export type BookingServiceBlock = {
    serviceId: number;
    category: string;
    duration: number;
    requestedEmployeeId: number | "any";
    qualifiedEmployeeIds: number[];
};

export type BookingBusyInterval = {
    employeeId: number;
    startMinutes: number;
    endMinutes: number;
};

export type BookingAvailabilityInput = {
    startMinutes: number;
    blocks: BookingServiceBlock[];
    busyIntervals: BookingBusyInterval[];

    // Existing scheduled workload, in minutes, by technician.
    // Optional so frontend availability checks can omit it.
    scheduledMinutesByEmployeeId?: Record<number, number>;
};

export type BookingAvailabilityResult = {
    available: boolean;
    assignments: {
        serviceId: number;
        employeeId: number;
        startMinutes: number;
        endMinutes: number;
    }[];
};

export function checkSlotAvailability(
    input: BookingAvailabilityInput
): BookingAvailabilityResult {
    const { startMinutes, blocks, busyIntervals } = input;

    const scheduledMinutesByEmployeeId =
    input.scheduledMinutesByEmployeeId ?? {};

    // Prefer the least-busy eligible technician.
    // Break ties using employee ID for deterministic results.
    const chooseTechnician = (candidates: number[]): number =>
        [...candidates].sort((a, b) => {
            const workloadA = scheduledMinutesByEmployeeId[a] ?? 0;
            const workloadB = scheduledMinutesByEmployeeId[b] ?? 0;

            return workloadA - workloadB || a - b;
        })[0];

    const unavailable = (): BookingAvailabilityResult => ({
        available: false,
        assignments: [],
    });

    const plannedBlocks: {
        block: BookingServiceBlock;
        startMinutes: number;
        endMinutes: number;
    }[] = [];

    let cursor = startMinutes;

    for (const block of blocks) {
        const endMinutes = cursor + block.duration;

        plannedBlocks.push({
            block,
            startMinutes: cursor,
            endMinutes,
        });

        cursor = endMinutes;
    }

    const isFree = (
        employeeId: number,
        start: number,
        end: number
    ) =>
        !busyIntervals.some(
            (busy) =>
                busy.employeeId === employeeId &&
                start < busy.endMinutes &&
                end > busy.startMinutes
        );

    // All nail services in one booking must use the same technician.
    const nailBlocks = plannedBlocks.filter(
        ({ block }) => block.category === "NAILS"
    );

    let nailEmployeeId: number | null = null;

    if (nailBlocks.length > 0) {
        const first = nailBlocks[0].block;

        const candidates = first.qualifiedEmployeeIds.filter(
            (employeeId) =>
                nailBlocks.every(
                    ({ block, startMinutes, endMinutes }) =>
                        block.qualifiedEmployeeIds.includes(employeeId) &&
                        (
                            block.requestedEmployeeId === "any" ||
                            block.requestedEmployeeId === employeeId
                        ) &&
                        isFree(employeeId, startMinutes, endMinutes)
                )
        );

        if (candidates.length === 0) {
            return unavailable();
        }

        // Deterministic candidate selection for the initial helper.
        nailEmployeeId = chooseTechnician(candidates)
    }

    const assignments: BookingAvailabilityResult["assignments"] = [];

    for (const { block, startMinutes, endMinutes } of plannedBlocks) {
        let employeeId: number;

        if (block.category === "NAILS") {
            if (nailEmployeeId === null) {
                return unavailable();
            }

            employeeId = nailEmployeeId;
        } else {
            const candidates = block.qualifiedEmployeeIds.filter(
                (candidateId) =>
                    (
                        block.requestedEmployeeId === "any" ||
                        block.requestedEmployeeId === candidateId
                    ) &&
                    isFree(candidateId, startMinutes, endMinutes)
            );

            if (candidates.length === 0) {
                return unavailable();
            }

            employeeId = chooseTechnician(candidates)
        }

        assignments.push({
            serviceId: block.serviceId,
            employeeId,
            startMinutes,
            endMinutes,
        });
    }

    return {
        available: true,
        assignments,
    };
}