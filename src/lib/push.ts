import webpush from "web-push";

type PushPayload = {
    title: string;
    body: string;
    url?: string;
};

function configureWebPush() {
    const subject = process.env.VAPID_SUBJECT;
    const publicKey =
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey =
        process.env.VAPID_PRIVATE_KEY;

    if (!subject || !publicKey || !privateKey) {
        throw new Error(
            "Web Push VAPID configuration is missing"
        );
    }

    webpush.setVapidDetails(
        subject,
        publicKey,
        privateKey
    );
}

export async function sendPushNotification(
    subscription: {
        endpoint: string;
        p256dh: string;
        auth: string;
    },
    payload: PushPayload
) {
    configureWebPush();

    return webpush.sendNotification(
        {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
            },
        },
        JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url ?? "/receptionist",
        })
    );
}