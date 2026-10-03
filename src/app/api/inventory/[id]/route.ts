import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export async function PATCH(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (!canManageStaff(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    try {
        const { id } = await context.params;
        const inventoryItemId = Number(id);
        const body = await request.json();

        const {
            name,
            category,
            unit,
            lowStockThreshold,
            notes,
            active,
        } = body;

        if (
            !Number.isInteger(inventoryItemId) ||
            inventoryItemId <= 0
        ) {
            return Response.json(
                { error: "Invalid inventory item" },
                { status: 400 }
            );
        }

        if (
            typeof name !== "string" ||
            !name.trim() ||
            typeof unit !== "string" ||
            !unit.trim() ||
            !Number.isInteger(lowStockThreshold) ||
            lowStockThreshold < 0 ||
            typeof active !== "boolean" ||
            (
                category !== undefined &&
                category !== null &&
                typeof category !== "string"
            ) ||
            (
                notes !== undefined &&
                notes !== null &&
                typeof notes !== "string"
            )
        ) {
            return Response.json(
                {
                    error:
                        "Invalid inventory item information",
                },
                { status: 400 }
            );
        }

        const existingItem =
            await prisma.inventoryItem.findUnique({
                where: {
                    id: inventoryItemId,
                },
                select: {
                    id: true,
                },
            });

        if (!existingItem) {
            return Response.json(
                { error: "Inventory item not found" },
                { status: 404 }
            );
        }

        /*
         * Quantity is intentionally not accepted here.
         * All stock changes must go through the adjustment endpoint
         * so InventoryMovement remains a complete audit trail.
         */
        const updatedItem =
            await prisma.inventoryItem.update({
                where: {
                    id: inventoryItemId,
                },
                data: {
                    name: name.trim(),

                    category:
                        typeof category === "string" &&
                        category.trim()
                            ? category.trim()
                            : null,

                    unit: unit.trim(),

                    lowStockThreshold,

                    notes:
                        typeof notes === "string" &&
                        notes.trim()
                            ? notes.trim()
                            : null,

                    active,
                },
            });

        return Response.json(updatedItem);
    } catch (error) {
        console.error(
            "Failed to update inventory item:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to update inventory item",
            },
            { status: 500 }
        );
    }
}