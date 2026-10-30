
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Read only from the approved Development database.
// Never use the default Production DATABASE_URL.
const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is missing.");
}

const endpoint = new URL(connectionString).hostname
    .replace(/-pooler(?=\.)/, "");

const approvedDevelopmentEndpoint =
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

if (endpoint !== approvedDevelopmentEndpoint) {
    throw new Error(
        "STOP: This audit only permits Neon Development."
    );
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
});

async function main() {
    const detailedDesign = await prisma.addon.findMany({
        where: {
            nameEs: "Diseño Elaborado",
        },
        select: {
            id: true,
            nameEs: true,
            nameEn: true,
            price: true,
            estimatedDuration: true,
            active: true,
        },
    });

    console.log("Diseño Elaborado:");
    console.table(detailedDesign);

    const services = await prisma.service.findMany({
        where: {
            nameEs: {
                in: ["Manicura Gel", "Pedicura Gel", "Diseño Elaborado"],
            },
        },
        select: {
            id: true,
            nameEs: true,
            nameEn: true,
            estimatedDuration: true,
            price: true,
            active: true,
        },
        orderBy: {
            id: "asc",
        },
    });

    console.table(services);

    if (
        services.length !== 2 ||
        new Set(services.map((s) => s.nameEs)).size !== 2
    ) {
        throw new Error(
            "STOP: Expected exactly two distinct Gel services."
        );
    }

    console.log("Read-only audit completed. No records changed.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });