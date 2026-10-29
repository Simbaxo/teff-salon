
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    groupFinalizedTechnicianItems,
    type FinalizedTechnicianItem,
} from "../src/lib/technicians/group-finalized-items";

function makeItem(
    id: number,
    saleId: number,
    employeeId: number | null,
    itemType = "SERVICE"
): FinalizedTechnicianItem {
    return {
        id,
        saleId,
        employeeId,
        itemType,
        itemName: `Item ${id}`,
        unitPrice: 60000,
        parentLineItemId: null,
    };
}

test("groups multiple services from one sale", () => {
    const groups = groupFinalizedTechnicianItems(10, [
        makeItem(1, 91, 10),
        makeItem(2, 91, 10),
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].saleId, 91);
    assert.deepEqual(
        groups[0].items.map((item) => item.id),
        [1, 2]
    );
});

test("keeps different sales separate", () => {
    const groups = groupFinalizedTechnicianItems(10, [
        makeItem(1, 91, 10),
        makeItem(2, 92, 10),
    ]);

    assert.equal(groups.length, 2);
    assert.deepEqual(
        groups.map((group) => group.saleId),
        [91, 92]
    );
});

test("excludes items attributed to another technician", () => {
    const groups = groupFinalizedTechnicianItems(10, [
        makeItem(1, 91, 10),
        makeItem(2, 91, 20),
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(
        groups[0].items.map((item) => item.id),
        [1]
    );
});

test("deduplicates repeated line-item IDs", () => {
    const item = makeItem(1, 91, 10);

    const groups = groupFinalizedTechnicianItems(10, [
        item,
        item,
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].items.length, 1);
});

test("excludes legacy items without technician attribution", () => {
    const groups = groupFinalizedTechnicianItems(10, [
        makeItem(1, 91, null),
    ]);

    assert.deepEqual(groups, []);
});

test("handles multiple technicians sharing one sale", () => {
    const groups = groupFinalizedTechnicianItems(10, [
        makeItem(1, 91, 10),
        makeItem(2, 91, 20),
        makeItem(3, 91, 10, "ADDON"),
    ]);

    assert.equal(groups.length, 1);
    assert.deepEqual(
        groups[0].items.map((item) => item.id),
        [1, 3]
    );
});

test("preserves individual add-on records", () => {
    const addon = {
        ...makeItem(3, 91, 10, "ADDON"),
        parentLineItemId: 1,
    };

    const groups = groupFinalizedTechnicianItems(10, [
        makeItem(1, 91, 10),
        addon,
    ]);

    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[0].items[1].parentLineItemId, 1);
});

test("handles empty finalized history", () => {
    const groups = groupFinalizedTechnicianItems(10, []);

    assert.deepEqual(groups, []);
});

test("does not mutate the input array", () => {
    const items = [
        makeItem(1, 91, 10),
        makeItem(2, 91, 20),
    ];

    const original = structuredClone(items);

    groupFinalizedTechnicianItems(10, items);

    assert.deepEqual(items, original);
});