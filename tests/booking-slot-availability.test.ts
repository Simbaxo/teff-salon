
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    checkSlotAvailability,
    type BookingServiceBlock,
    type BookingBusyInterval,
} from "../src/lib/booking/check-slot-availability";

const manicure: BookingServiceBlock = {
    serviceId: 1,
    category: "NAILS",
    duration: 60,
    requestedEmployeeId: "any",
    qualifiedEmployeeIds: [10, 20],
};

const pedicure: BookingServiceBlock = {
    serviceId: 2,
    category: "NAILS",
    duration: 60,
    requestedEmployeeId: "any",
    qualifiedEmployeeIds: [10, 20],
};

function busy(
    employeeId: number,
    startMinutes: number,
    endMinutes: number
): BookingBusyInterval {
    return {
        employeeId,
        startMinutes,
        endMinutes,
    };
}

test("single manicure is available", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [manicure],
        busyIntervals: [],
    });

    assert.equal(result.available, true);
    assert.equal(result.assignments.length, 1);
    assert.equal(result.assignments[0].startMinutes, 600);
    assert.equal(result.assignments[0].endMinutes, 660);
});

test("add-on duration extends the service block", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [
            {
                ...manicure,
                duration: 90,
                qualifiedEmployeeIds: [10],
            },
        ],
        busyIntervals: [
            busy(10, 660, 720),
        ],
    });

    assert.equal(result.available, false);
});

test("multiple nail services use one technician", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [manicure, pedicure],
        busyIntervals: [],
    });

    assert.equal(result.available, true);
    assert.equal(result.assignments.length, 2);

    assert.equal(
        result.assignments[0].employeeId,
        result.assignments[1].employeeId
    );

    assert.deepEqual(
        result.assignments.map((item) => [
            item.startMinutes,
            item.endMinutes,
        ]),
        [
            [600, 660],
            [660, 720],
        ]
    );
});

test("chooses technician available for both nail services", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [manicure, pedicure],
        busyIntervals: [
            busy(10, 660, 720),
        ],
    });

    assert.equal(result.available, true);

    assert.deepEqual(
        result.assignments.map((item) => item.employeeId),
        [20, 20]
    );
});

test("respects a specifically requested technician", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [
            {
                ...manicure,
                requestedEmployeeId: 20,
            },
        ],
        busyIntervals: [],
    });

    assert.equal(result.available, true);
    assert.equal(result.assignments[0].employeeId, 20);
});

test("does not replace a busy requested technician", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [
            {
                ...manicure,
                requestedEmployeeId: 10,
            },
        ],
        busyIntervals: [
            busy(10, 600, 660),
        ],
    });

    assert.equal(result.available, false);
});

test("rejects technician schedule-block conflicts", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [
            {
                ...manicure,
                qualifiedEmployeeIds: [10],
            },
        ],
        busyIntervals: [
            busy(10, 630, 690),
        ],
    });

    assert.equal(result.available, false);
});

test("rejects services without qualified technicians", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [
            {
                ...manicure,
                qualifiedEmployeeIds: [],
            },
        ],
        busyIntervals: [],
    });

    assert.equal(result.available, false);
});

test("allows back-to-back appointments", () => {
    const result = checkSlotAvailability({
        startMinutes: 660,
        blocks: [
            {
                ...manicure,
                qualifiedEmployeeIds: [10],
            },
        ],
        busyIntervals: [
            busy(10, 600, 660),
        ],
    });

    assert.equal(result.available, true);
});

test("does not modify the original booking inputs", () => {
    const blocks = [
        { ...manicure },
        { ...pedicure },
    ];

    const original = structuredClone(blocks);

    checkSlotAvailability({
        startMinutes: 600,
        blocks,
        busyIntervals: [],
    });

    assert.deepEqual(blocks, original);
});


test("prefers the least-busy available technician", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [manicure],
        busyIntervals: [],
        scheduledMinutesByEmployeeId: {
            10: 240,
            20: 60,
        },
    });

    assert.equal(result.available, true);
    assert.equal(result.assignments[0].employeeId, 20);
});

test("availability takes priority over workload balancing", () => {
    const result = checkSlotAvailability({
        startMinutes: 600,
        blocks: [manicure, pedicure],
        busyIntervals: [
            busy(20, 660, 720),
        ],
        scheduledMinutesByEmployeeId: {
            10: 240,
            20: 0,
        },
    });

    assert.equal(result.available, true);

    // Technician 20 is less busy but cannot perform both.
    // Technician 10 can complete the entire booking.
    assert.deepEqual(
        result.assignments.map((item) => item.employeeId),
        [10, 10]
    );
});