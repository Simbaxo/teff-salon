// TEFF Web Push service worker

// Receive a push notification from the TEFF server
self.addEventListener("push", (event) => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = {};
    }

    const title = data.title || "TEFF Beauty Salon";

    const options = {
        body:
            data.body ||
            "Tienes una nueva notificación.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: {
            url: data.url || "/receptionist",
        },
    };

    event.waitUntil(
        self.registration.showNotification(
            title,
            options
        )
    );
});

// Open TEFF when the user taps the notification
self.addEventListener(
    "notificationclick",
    (event) => {
        event.notification.close();

        const destination =
            event.notification.data?.url ||
            "/receptionist";

        event.waitUntil(
            clients.matchAll({
                type: "window",
                includeUncontrolled: true,
            }).then((windowClients) => {
                // Reuse an existing TEFF window when possible
                for (const client of windowClients) {
                    if (
                        "focus" in client &&
                        client.url.includes(
                            self.location.origin
                        )
                    ) {
                        client.navigate(destination);
                        return client.focus();
                    }
                }

                return clients.openWindow(destination);
            })
        );
    }
);