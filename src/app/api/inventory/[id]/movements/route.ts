import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export async function GET(
    _request: Request,
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

        if (
            !Number.isInteger(inventoryItemId) ||
            inventoryItemId <= 0
        ) {
            return Response.json(
                { error: "Invalid inventory item" },
                { status: 400 }
            );
        }

        // Confirm the inventory item exists before loading its history
        const item =
            await prisma.inventoryItem.findUnique({
                where: {
                    id: inventoryItemId,
                },
                select: {
                    id: true,
                    name: true,
                    unit: true,
                    quantity: true,
                    active: true,
                },
            });

        if (!item) {
            return Response.json(
                { error: "Inventory item not found" },
                { status: 404 }
            );
        }

        const movements =
            await prisma.inventoryMovement.findMany({
                where: {
                    inventoryItemId,
                },

                select: {
                    id: true,
                    type: true,
                    quantityChange: true,
                    quantityBefore: true,
                    quantityAfter: true,
                    note: true,
                    createdAt: true,

                    user: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },

                orderBy: {
                    createdAt: "desc",
                },
            });

        return Response.json({
            item,
            movements,
        });
    } catch (error) {
        console.error(
            "Failed to load inventory movement history:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to load inventory movement history",
            },
            { status: 500 }
        );
    }
}