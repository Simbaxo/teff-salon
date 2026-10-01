import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/",
        name: "TEFF Beauty Salon",
        short_name: "TEFF",
        description:
            "TEFF Beauty Salon booking and salon management app",

        // The installed salon app opens directly into Reception.
        start_url: "/receptionist",

        display: "standalone",
        background_color: "#f5f5f5",
        theme_color: "#000000",
        orientation: "any",

        icons: [
            {
                src: "/icon-192.png",
                sizes: "192x192",
                type: "image/png",
            },
            {
                src: "/icon-512.png",
                sizes: "512x512",
                type: "image/png",
            },
        ],
    };
}