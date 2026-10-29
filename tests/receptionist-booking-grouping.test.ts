
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    getReceptionBookingKey,
    countReceptionBookings,
    groupReceptionBookings,
} from "../src/lib/receptionist/group-bookings";

function makeAppointment(
    id: number,
    bookingId: number | null,
    customerId: number,
    employeeId = 10
) {
    return {
        id,
        bookingId,
        employeeId,
        customer: {
            id: customerId,
            name: `Cliente ${customerId}`,
        },
    };
}

test("one booking with two services counts as one cita", () => {
    const appointments = [
        makeAppointment(1, 100, 10),
        makeAppointment(2, 100, 10),
    ];

    assert.equal(countReceptionBookings(appointments), 1);
});

test("two bookings by the same customer count separately", () => {
    const appointments = [
        makeAppointment(1, 100, 10),
        makeAppointment(2, 200, 10),
    ];

    assert.equal(countReceptionBookings(appointments), 2);
    assert.equal(groupReceptionBookings(appointments).length, 2);
});

test("multiple technicians in one booking count as one cita", () => {
    const appointments = [
        makeAppointment(1, 100, 10, 20),
        makeAppointment(2, 100, 10, 30),
    ];

    assert.equal(countReceptionBookings(appointments), 1);
});

test("legacy appointments remain independent", () => {
    const appointments = [
        makeAppointment(1, null, 10),
        makeAppointment(2, null, 10),
    ];

    assert.equal(countReceptionBookings(appointments), 2);
    assert.equal(groupReceptionBookings(appointments).length, 2);
});

test("groups service blocks from one booking together", () => {
    const appointments = [
        makeAppointment(1, 100, 10),
        makeAppointment(2, 100, 10),
    ];

    const groups = groupReceptionBookings(appointments);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].appointments.length, 2);
    assert.equal(groups[0].customerId, 10);
});

test("separate bookings have independent expansion keys", () => {
    const first = makeAppointment(1, 100, 10);
    const second = makeAppointment(2, 200, 10);

    assert.notEqual(
        getReceptionBookingKey(first),
        getReceptionBookingKey(second)
    );
});

test("appointments sharing a booking share an expansion key", () => {
    const first = makeAppointment(1, 100, 10);
    const second = makeAppointment(2, 100, 10);

    assert.equal(
        getReceptionBookingKey(first),
        getReceptionBookingKey(second)
    );
});

test("booking keys cannot collide with legacy appointment keys", () => {
    assert.notEqual(
        getReceptionBookingKey(makeAppointment(1, 100, 10)),
        getReceptionBookingKey(makeAppointment(100, null, 10))
    );
});

test("handles an empty appointment list", () => {
    assert.equal(countReceptionBookings([]), 0);
    assert.deepEqual(groupReceptionBookings([]), []);
});

test("does not mutate the original appointments array", () => {
    const appointments = [
        makeAppointment(1, 100, 10),
        makeAppointment(2, 100, 10),
    ];

    const original = structuredClone(appointments);

    groupReceptionBookings(appointments);

    assert.deepEqual(appointments, original);
});