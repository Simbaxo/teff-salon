import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        id: "/",
        name: "TEFF Beauty Salon",
        short_name: "TEFF",
        description:
            "TEFF Beauty Salon booking and salon management app",
        start_url: "/",
        display: "standalone",
        background_color: "#f5f5f5",
        theme_color: "#000000",
        orientation: "any",
    };
}