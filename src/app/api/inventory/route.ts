import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

// Add a UI-Friendly status without storing redundant status data
// in the database
function getInventoryStatus(
    quantity: number,
    lowStockThreshold: number
) {
    if (quantity === 0) {
        return "OUT_OF_STOCK";
    }

    if (quantity <= lowStockThreshold) {
        return "LOW_STOCK";
    }

    return "IN_STOCK";
}

export async function GET() {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (!canManageStaff(session.user.role)) {
        return Response.json(
            { error: "Forbidden "},
            { status: 403 }
        );
    }

    try {
        const items =
            await prisma.inventoryItem.findMany({
                where: {
                    active: true,
                },
                orderBy: [
                    {
                        category: "asc",
                    },
                    {
                        name: "asc",
                    },
                ],
            });

            return Response.json(
                items.map((item) => ({
                    ...item,
                    status: getInventoryStatus(
                        item.quantity,
                        item.lowStockThreshold
                    ),
                }))
            );
    } catch (error) {
        console.error(
            "Failed to load inventory:",
            error
        )

        return Response.json(
            {
                error:
                    "Unable to load inventory",
            },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
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
            {
                error:
                    "Invalid authenticated user",
            },
            { status: 400 }
        );
    }

    try {
        const body = await request.json()

        const {
            name,
            category,
            unit,
            quantity,
            lowStockThreshold,
            notes,
        } = body;

        // Validate required inventory information
        if (
            typeof name !== "string" ||
            !name.trim() ||
            !Number.isInteger(quantity) ||
            quantity < 0 ||
            !Number.isInteger(
                lowStockThreshold
            ) ||
            lowStockThreshold < 0
        ) {
            return Response.json(
                {
                    error:
                        "Invalid inventory item information",
                },
                { status: 400 }
            );
        }

        if (
            category !== undefined &&
            category !== null &&
            typeof category !== "string"
        ) {
            return Response.json(
                {
                    error:
                        "Invalid inventory category",
                },
                { status: 400 }
            );
        }

        if (
            unit !== undefined &&
            unit !== null &&
            (typeof unit !== "string" ||
                !unit.trim())
        ) {
            return Response.json(
                {
                    error:
                        "Invalid inventory unit",
                },
                { status: 400 }
            );
        }

        if (
            notes !== undefined &&
            notes !== null &&
            typeof notes !== "string"
        ) {
            return Response.json(
                {
                    error:
                        "Invalid inventory notes",
                },
                { status: 400 }
            );
        }

        // Item creation and its initial inventory movement belong
        // in the same transaction so the audit trail always matches
        const result =
            await prisma.$transaction(
                async (tx) => {
                    const item =
                        await tx.inventoryItem.create({
                            data: {
                                name: name.trim(),

                                category:
                                    typeof category ===
                                        "string" &&
                                    category.trim()
                                        ? category.trim()
                                        : null,

                                unit:
                                    typeof unit ===
                                        "string" &&
                                    unit.trim()
                                        ? unit.trim()
                                        : "unidad",

                                quantity,

                                lowStockThreshold,

                                notes:
                                    typeof notes ===
                                        "string" &&
                                    notes.trim()
                                        ? notes.trim()
                                        : null,
                            },
                        });

                        // If the item start with stock, record where
                        // the opening quantity came from
                        if (quantity > 0) {
                        await tx.inventoryMovement.create({
                            data: {
                                inventoryItemId:
                                    item.id,

                                userId,

                                type: "CORRECTION",

                                quantityChange:
                                    quantity,

                                quantityBefore: 0,
                                quantityAfter:
                                    quantity,

                                note:
                                    "Inventario inicial",
                            },
                        });
                    }

                    return item;
                }
            );

            return Response.json(
                {
                    ...result,

                    status: getInventoryStatus(
                        result.quantity,
                        result.lowStockThreshold
                    ),
                },
                { status: 201 }
            );
    } catch (error) {
        console.error(
            "Failed to create inventory item:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to create inventory item",
            },
            { status: 500 }
        );
    }
}