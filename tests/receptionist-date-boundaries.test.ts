
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    addTeffDays,
    getTeffDayOfWeek,
    getTeffDayStart,
} from "../src/lib/datetime";

function getWeekBounds(date: string) {
    const weekday = getTeffDayOfWeek(date);
    const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

    const monday = addTeffDays(date, -daysSinceMonday);

    return {
        start: getTeffDayStart(monday),
        end: getTeffDayStart(addTeffDays(monday, 7)),
    };
}

function getMonthBounds(date: string) {
    const [year, month] = date.split("-").map(Number);

    const nextMonth = new Date(
        Date.UTC(year, month, 1)
    ).toISOString().slice(0, 10);

    return {
        start: getTeffDayStart(`${date.slice(0, 7)}-01`),
        end: getTeffDayStart(nextMonth),
    };
}

test("Medellín midnight equals 05:00 UTC", () => {
    assert.equal(
        getTeffDayStart("2026-10-28").toISOString(),
        "2026-10-28T05:00:00.000Z"
    );
});

test("late evening sales belong to the correct day", () => {
    const start = getTeffDayStart("2026-10-28");
    const end = getTeffDayStart("2026-10-29");

    const sale = new Date("2026-10-29T04:59:00.000Z");

    assert.ok(sale >= start && sale < end);
});

test("next-day midnight is excluded from the previous day", () => {
    const end = getTeffDayStart("2026-10-29");
    const sale = new Date("2026-10-29T05:00:00.000Z");

    assert.ok(!(sale < end));
});

test("weekly reporting starts Monday and ends next Monday", () => {
    const { start, end } = getWeekBounds("2026-10-28");

    assert.equal(start.toISOString(), "2026-10-26T05:00:00.000Z");
    assert.equal(end.toISOString(), "2026-11-02T05:00:00.000Z");
});

test("Sunday evening remains in the current week", () => {
    const { start, end } = getWeekBounds("2026-11-01");
    const sale = new Date("2026-11-02T04:30:00.000Z");

    assert.ok(sale >= start && sale < end);
});

test("monthly reporting respects the October-November boundary", () => {
    const { start, end } = getMonthBounds("2026-10-28");

    assert.equal(start.toISOString(), "2026-10-01T05:00:00.000Z");
    assert.equal(end.toISOString(), "2026-11-01T05:00:00.000Z");
});

test("December reporting ends in the following year", () => {
    const { start, end } = getMonthBounds("2026-12-15");

    assert.equal(start.toISOString(), "2026-12-01T05:00:00.000Z");
    assert.equal(end.toISOString(), "2027-01-01T05:00:00.000Z");
});


test("appointment calendar dates use UTC midnight", () => {
    const date = "2026-10-28";

    const appointmentDate = new Date(
        `${date}T00:00:00.000Z`
    );

    assert.equal(
        appointmentDate.toISOString(),
        "2026-10-28T00:00:00.000Z"
    );
});

test("appointment dates differ from sales timestamp boundaries", () => {
    const date = "2026-10-28";

    const appointmentDate = new Date(
        `${date}T00:00:00.000Z`
    );

    const salesDayStart = getTeffDayStart(date);

    assert.notEqual(
        appointmentDate.getTime(),
        salesDayStart.getTime()
    );
});

test("appointment date equality matches the stored calendar date", () => {
    const date = "2026-10-28";

    const storedAppointmentDate = new Date(
        "2026-10-28T00:00:00.000Z"
    );

    const queryDate = new Date(
        `${date}T00:00:00.000Z`
    );

    assert.equal(
        storedAppointmentDate.getTime(),
        queryDate.getTime()
    );
});


test("weekly appointment boundaries use UTC calendar dates", () => {
    const today = "2026-10-28";
    const weekday = getTeffDayOfWeek(today);
    const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

    const monday = addTeffDays(today, -daysSinceMonday);
    const nextMonday = addTeffDays(monday, 7);

    const start = new Date(`${monday}T00:00:00.000Z`);
    const end = new Date(`${nextMonday}T00:00:00.000Z`);

    assert.equal(
        start.toISOString(),
        "2026-10-26T00:00:00.000Z"
    );

    assert.equal(
        end.toISOString(),
        "2026-11-02T00:00:00.000Z"
    );
});

test("weekly appointment query includes Monday through Sunday only", () => {
    const start = new Date("2026-10-26T00:00:00.000Z");
    const end = new Date("2026-11-02T00:00:00.000Z");

    const monday = new Date("2026-10-26T00:00:00.000Z");
    const sunday = new Date("2026-11-01T00:00:00.000Z");
    const followingMonday = new Date("2026-11-02T00:00:00.000Z");

    assert.ok(monday >= start && monday < end);
    assert.ok(sunday >= start && sunday < end);
    assert.ok(!(followingMonday >= start && followingMonday < end));
});