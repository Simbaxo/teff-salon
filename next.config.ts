import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Use a separate build directory for isolated payroll testing.
    distDir:
        process.env.TEFF_PAYROLL_TEST === "true"
            ? ".next-payroll-test"
            : ".next",

    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "*.public.blob.vercel-storage.com",
            },
        ],
    },
};

export default nextConfig;
