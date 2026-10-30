
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Read only from the approved Development database.
// Never use the default Production DATABASE_URL.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is missing.");
}

const endpoint = new URL(connectionString).hostname
    .replace(/-pooler(?=\.)/, "");

const approvedProductionEndpoint =
    "ep-misty-bird-ax2o1u0v.c-4.us-east-2.aws.neon.tech";

if (endpoint !== approvedProductionEndpoint) {
    throw new Error(
        "STOP: This read-only audit requires the approved TEFF Production database."
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

    console.log("Production — Diseño Elaborado:");
    console.table(detailedDesign);

    if (
        detailedDesign.length !== 1 ||
        detailedDesign[0].nameEn !== "Detailed Nail Art" ||
        detailedDesign[0].price !== 20000 ||
        !detailedDesign[0].active
    ) {
        throw new Error(
            "STOP: Production add-on does not match the expected catalog."
        );
    }

    const services = await prisma.service.findMany({
        where: {
            nameEs: {
                in: ["Manicura Gel", "Pedicura Gel"],
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