import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

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

    if (!Number.isInteger(userId) || userId <= 0) {
        return Response.json(
            { error: "Invalid authenticated user" },
            { status: 400 }
        );
    }

    try {
        const body = await request.json();

        const endpoint = body?.endpoint;
        const p256dh = body?.keys?.p256dh;
        const authKey = body?.keys?.auth;

        if (
            typeof endpoint !== "string" ||
            !endpoint.trim() ||
            typeof p256dh !== "string" ||
            !p256dh.trim() ||
            typeof authKey !== "string" ||
            !authKey.trim()
        ) {
            return Response.json(
                {
                    error:
                        "Invalid push subscription",
                },
                { status: 400 }
            );
        }

        // A browser endpoint identifies one push subscription
        // Re-enabling notifications updates the existing device
        // instead of creating duplicate records
        const subscription =
            await prisma.pushSubscription.upsert({
                where: {
                    endpoint,
                },
                update: {
                    userId,
                    p256dh,
                    auth: authKey,
                },
                create: {
                    userId,
                    endpoint,
                    p256dh,
                    auth: authKey,
                },
                select: {
                    id: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });

        return Response.json(
            {
                success: true,
                subscription,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error(
            "Failed to save push subscription:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to save push subscription",
            },
            { status: 500 }
        );
    }
}