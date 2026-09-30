import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push";

export async function POST() {
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

    const subscriptions =
        await prisma.pushSubscription.findMany({
            where: {
                userId,
            },
        });

    if (subscriptions.length === 0) {
        return Response.json(
            {
                error:
                    "No push subscriptions are registered for this user",
            },
            { status: 404 }
        );
    }

    let sent = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
        try {
            await sendPushNotification(
                subscription,
                {
                    title: "🔔 Prueba TEFF",
                    body:
                        "Las notificaciones push están funcionando.",
                    url: "/receptionist",
                }
            );

            sent += 1;
        } catch (error) {
            failed += 1;

            console.error(
                `Push test failed for subscription ${subscription.id}:`,
                error
            );

            // 404/410 normally means the browser's subscription
            // no longer exists. Remove stale subscriptions.
            const statusCode =
                typeof error === "object" &&
                error !== null &&
                "statusCode" in error
                    ? Number(error.statusCode)
                    : null;

            if (
                statusCode === 404 ||
                statusCode === 410
            ) {
                await prisma.pushSubscription.delete({
                    where: {
                        id: subscription.id,
                    },
                });
            }
        }
    }

    if (sent === 0) {
        return Response.json(
            {
                error:
                    "The push notification could not be delivered",
                sent,
                failed,
            },
            { status: 502 }
        );
    }

    return Response.json({
        success: true,
        sent,
        failed,
    });
}