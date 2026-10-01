import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

const movementTypes = [
    "RESTOCK",
    "USAGE",
    "DAMAGED",
    "CORRECTION",
] as const;

type MovementType =
    (typeof movementTypes)[number];

export async function POST(
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

    const userId = Number(session.user.id);

    if (
        !Number.isInteger(userId) ||
        userId <= 0
    ) {
        return Response.json(
            { error: "Invalid authenticated user" },
            { status: 400 }
        );
    }

    try {
        const { id } = await context.params;
        const body = await request.json();

        const inventoryItemId = Number(id);
        const type = body.type;
        const quantity = body.quantity;
        const note = body.note;

        if (
            !Number.isInteger(inventoryItemId) ||
            inventoryItemId <= 0 ||
            typeof type !== "string" ||
            !movementTypes.includes(
                type as MovementType
            ) ||
            !Number.isInteger(quantity) ||
            quantity === 0 ||
            (note !== undefined &&
                note !== null &&
                typeof note !== "string")
        ) {
            return Response.json(
                {
                    error:
                        "Invalid inventory adjustment",
                },
                { status: 400 }
            );
        }

        /*
         * RESTOCK always adds stock.
         * USAGE and DAMAGED always remove stock.
         * CORRECTION may add or remove stock.
         */
        let quantityChange: number;

        switch (type as MovementType) {
            case "RESTOCK":
                if (quantity < 0) {
                    return Response.json(
                        {
                            error:
                                "Restock quantity must be positive",
                        },
                        { status: 400 }
                    );
                }

                quantityChange = quantity;
                break;

            case "USAGE":
            case "DAMAGED":
                if (quantity < 0) {
                    return Response.json(
                        {
                            error:
                                "Removal quantity must be positive",
                        },
                        { status: 400 }
                    );
                }

                quantityChange = -quantity;
                break;

            case "CORRECTION":
                quantityChange = quantity;
                break;
        }

        const result = await prisma.$transaction(
            async (tx) => {
                const item =
                    await tx.inventoryItem.findUnique({
                        where: {
                            id: inventoryItemId,
                        },
                    });

                if (!item || !item.active) {
                    throw new Error(
                        "INVENTORY_ITEM_NOT_FOUND"
                    );
                }

                const quantityBefore = item.quantity;
                const quantityAfter =
                    quantityBefore + quantityChange;

                // Inventory cannot fall below zero.
                if (quantityAfter < 0) {
                    throw new Error(
                        "INSUFFICIENT_INVENTORY"
                    );
                }

                const updatedItem =
                    await tx.inventoryItem.update({
                        where: {
                            id: inventoryItemId,
                        },
                        data: {
                            quantity: quantityAfter,
                        },
                    });

                const movement =
                    await tx.inventoryMovement.create({
                        data: {
                            inventoryItemId,
                            userId,
                            type:
                                type as MovementType,
                            quantityChange,
                            quantityBefore,
                            quantityAfter,

                            note:
                                typeof note ===
                                    "string" &&
                                note.trim()
                                    ? note.trim()
                                    : null,
                        },
                    });

                return {
                    item: updatedItem,
                    movement,
                };
            }
        );

        return Response.json(result);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message ===
                "INVENTORY_ITEM_NOT_FOUND"
        ) {
            return Response.json(
                {
                    error:
                        "Inventory item not found",
                },
                { status: 404 }
            );
        }

        if (
            error instanceof Error &&
            error.message ===
                "INSUFFICIENT_INVENTORY"
        ) {
            return Response.json(
                {
                    error:
                        "Inventory cannot fall below zero",
                },
                { status: 409 }
            );
        }

        console.error(
            "Failed to adjust inventory:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to adjust inventory",
            },
            { status: 500 }
        );
    }
}