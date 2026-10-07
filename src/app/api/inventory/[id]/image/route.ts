import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { del, put } from "@vercel/blob";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);

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

        const item =
            await prisma.inventoryItem.findUnique({
                where: {
                    id: inventoryItemId,
                },
                select: {
                    id: true,
                    imageUrl: true,
                },
            });

        if (!item) {
            return Response.json(
                { error: "Inventory item not found" },
                { status: 404 }
            );
        }

        const formData =
            await request.formData();

        const file = formData.get("image");

        if (!(file instanceof File)) {
            return Response.json(
                { error: "Image is required" },
                { status: 400 }
            );
        }

        if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
            return Response.json(
                {
                    error:
                        "Only JPEG, PNG, WebP, HEIC, or HEIF images are allowed",
                },
                { status: 400 }
            );
        }

        if (file.size <= 0) {
            return Response.json(
                { error: "Image is empty" },
                { status: 400 }
            );
        }

        if (file.size > MAX_IMAGE_SIZE) {
            return Response.json(
                {
                    error:
                        "Image must be 5 MB or smaller",
                },
                { status: 413 }
            );
        }

        const extension =
            file.name
                .split(".")
                .pop()
                ?.toLowerCase()
                .replace(
                    /[^a-z0-9]/g,
                    ""
                ) || "jpg";

        /*
         * Use a unique pathname for every replacement.
         * This prevents an old cached image from being shown
         * after Angy replaces a product photo.
         */
        const pathname =
            `inventory/${inventoryItemId}/` +
            `${Date.now()}.${extension}`;

        const blob = await put(
            pathname,
            file,
            {
                access: "public",
                addRandomSuffix: true,
                token:
                    process.env.BLOB_READ_WRITE_TOKEN,
            }
        );
        /*
         * Save the new URL before deleting the previous Blob.
         * If the database update fails, the existing photo remains intact.
         */
        const updatedItem =
            await prisma.inventoryItem.update({
                where: {
                    id: inventoryItemId,
                },
                data: {
                    imageUrl: blob.url,
                },
            });

        // Replacement cleanup should not make an otherwise successful upload fail.
        if (
            item.imageUrl &&
            item.imageUrl !== blob.url
        ) {
            try {
                await del(item.imageUrl, {
                    token:
                        process.env.BLOB_READ_WRITE_TOKEN,
                });
            } catch (error) {
                console.error(
                    "Failed to delete previous inventory image:",
                    error
                );
            }
        }

        return Response.json({
            item: updatedItem,
            imageUrl: blob.url,
        });
    } catch (error) {
        console.error(
            "Failed to upload inventory image:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to upload inventory image",
            },
            { status: 500 }
        );
    }
}

export async function DELETE(
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

        const item =
            await prisma.inventoryItem.findUnique({
                where: {
                    id: inventoryItemId,
                },
                select: {
                    id: true,
                    imageUrl: true,
                },
            });

        if (!item) {
            return Response.json(
                { error: "Inventory item not found" },
                { status: 404 }
            );
        }

        if (!item.imageUrl) {
            return Response.json({
                success: true,
            });
        }

        /*
         * Clear the database reference first.
         * A Blob cleanup failure should not leave the app pointing
         * at an image the user asked to remove.
         */
        await prisma.inventoryItem.update({
            where: {
                id: inventoryItemId,
            },
            data: {
                imageUrl: null,
            },
        });

        try {
            await del(item.imageUrl, {
                token:
                    process.env.BLOB_READ_WRITE_TOKEN,
            });
        } catch (error) {
            console.error(
                "Failed to delete inventory Blob:",
                error
            );
        }

        return Response.json({
            success: true,
        });
    } catch (error) {
        console.error(
            "Failed to remove inventory image:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to remove inventory image",
            },
            { status: 500 }
        );
    }
}