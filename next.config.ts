import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Keep normal development, payroll tests,
    // and booking tests in separate build directories.
    distDir:
        process.env.TEFF_BOOKING_TEST === "true"
            ? ".next-booking-test"
            : process.env.TEFF_PAYROLL_TEST === "true"
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
