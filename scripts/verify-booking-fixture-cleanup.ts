
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
    throw new Error("STOP: TEST_DATABASE_URL is missing.");
}

const endpoint = new URL(connectionString).hostname
    .replace(/-pooler(?=\.)/, "");

const approvedEndpoint =
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

if (endpoint !== approvedEndpoint) {
    throw new Error("STOP: Neon Development only.");
}

const marker =
    "teff-booking-c242f244-6baf-4941-9963-6b4bec94017d";

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
});

async function main() {
    const [customers, employees, services, addons, bookings] =
        await Promise.all([
            prisma.customer.count({
                where: { name: { startsWith: marker } },
            }),
            prisma.employee.count({
                where: { name: { startsWith: marker } },
            }),
            prisma.service.count({
                where: { nameEs: { startsWith: marker } },
            }),
            prisma.addon.count({
                where: { nameEs: { startsWith: marker } },
            }),
            prisma.booking.count({
                where: { notes: marker },
            }),
        ]);

    console.table({
        customers,
        employees,
        services,
        addons,
        bookings,
    });

    if (
        [customers, employees, services, addons, bookings]
            .some((count) => count !== 0)
    ) {
        throw new Error("STOP: Fixture records remain.");
    }

    console.log("PASS: Booking fixture cleanup verified.");
    console.log("READ ONLY: No database records modified.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });