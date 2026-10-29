
export type FinalizedTechnicianItem = {
    id: number;
    saleId: number;
    employeeId: number | null;
    itemType: string;
    itemName: string;
    unitPrice: number;
    parentLineItemId: number | null;
};

export type TechnicianSaleGroup<T extends FinalizedTechnicianItem> = {
    saleId: number;
    items: T[];
};

export function groupFinalizedTechnicianItems<
    T extends FinalizedTechnicianItem
>(
    employeeId: number,
    items: T[]
): TechnicianSaleGroup<T>[] {
    const groups = new Map<number, TechnicianSaleGroup<T>>();
    const seenItemIds = new Set<number>();

    for (const item of items) {
        // Never attribute another technician's service to this employee.
        if (item.employeeId !== employeeId) {
            continue;
        }

        // Prevent duplicate item records from appearing in history.
        if (seenItemIds.has(item.id)) {
            continue;
        }

        seenItemIds.add(item.id);

        let group = groups.get(item.saleId);

        if (!group) {
            group = {
                saleId: item.saleId,
                items: [],
            };

            groups.set(item.saleId, group);
        }

        group.items.push(item);
    }

    return [...groups.values()];
}