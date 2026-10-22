
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    getAssignmentPayloadError,
} from "../src/lib/checkout/assignment-payload-guard";

// Existing checkout requests must remain supported.
test("allows legacy checkout without assignments", () => {
    assert.equal(
        getAssignmentPayloadError(undefined, undefined),
        null
    );
});

test("rejects missing add-on assignments", () => {
    const result = getAssignmentPayloadError([], undefined);

    assert.equal(result?.status, 400);
    assert.equal(
        result?.body.conflictType,
        "INCOMPLETE_ASSIGNMENTS"
    );
});

test("rejects missing service assignments", () => {
    const result = getAssignmentPayloadError(undefined, []);

    assert.equal(result?.status, 400);
    assert.equal(
        result?.body.conflictType,
        "INCOMPLETE_ASSIGNMENTS"
    );
});

test("rejects invalid service assignment arrays", () => {
    const result = getAssignmentPayloadError({}, []);

    assert.equal(result?.status, 400);
    assert.equal(
        result?.body.conflictType,
        "INVALID_ASSIGNMENTS"
    );
});

test("rejects invalid add-on assignment arrays", () => {
    const result = getAssignmentPayloadError([], null);

    assert.equal(result?.status, 400);
    assert.equal(
        result?.body.conflictType,
        "INVALID_ASSIGNMENTS"
    );
});

test("blocks complete assignments until enabled", () => {
    const result = getAssignmentPayloadError(
        [
            {
                serviceId: 10,
                appointmentId: 101,
                employeeId: 2,
                price: 60000,
            },
        ],
        []
    );

    assert.equal(result?.status, 409);
    assert.equal(
        result?.body.conflictType,
        "ASSIGNMENTS_NOT_ENABLED"
    );
});

test("blocks empty assignment arrays until enabled", () => {
    const result = getAssignmentPayloadError([], []);

    assert.equal(result?.status, 409);
    assert.equal(
        result?.body.conflictType,
        "ASSIGNMENTS_NOT_ENABLED"
    );
});


test("allows complete assignments with test authorization", () => {
    const result = getAssignmentPayloadError(
        [
            {
                serviceId: 10,
                appointmentId: 101,
                employeeId: 2,
                price: 60000,
            },
        ],
        [],
        true
    );

    assert.equal(result, null);
});

test("allows empty assignment arrays with test authorization", () => {
    const result = getAssignmentPayloadError([], [], true);

    assert.equal(result, null);
});

test("rejects incomplete assignments even with authorization", () => {
    const result = getAssignmentPayloadError([], undefined, true);

    assert.equal(result?.status, 400);
    assert.equal(
        result?.body.conflictType,
        "INCOMPLETE_ASSIGNMENTS"
    );
});

test("rejects invalid assignments even with authorization", () => {
    const result = getAssignmentPayloadError({}, [], true);

    assert.equal(result?.status, 400);
    assert.equal(
        result?.body.conflictType,
        "INVALID_ASSIGNMENTS"
    );
});