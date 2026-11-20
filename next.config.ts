import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep normal development and test servers
  // in separate build directories.
  distDir:
    process.env.TEFF_CASHBOX_TEST === "true"
      ? ".next-cashbox-test"
      : process.env.TEFF_BOOKING_TEST === "true"
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
