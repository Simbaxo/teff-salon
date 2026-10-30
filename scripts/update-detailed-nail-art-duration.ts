
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
    throw new Error("STOP: TEST_DATABASE_URL is missing.");
}

const approvedEndpoint =
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

const endpoint = new URL(connectionString)
    .hostname.replace(/-pooler(?=\.)/, "");

if (endpoint !== approvedEndpoint) {
    throw new Error("STOP: Neon Development only.");
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
});

async function main() {
    const result = await prisma.$transaction(async (tx) => {
        const addon = await tx.addon.findUnique({
            where: { id: 6 },
        });

        if (
            !addon ||
            addon.nameEs !== "Diseño Elaborado" ||
            addon.nameEn !== "Detailed Nail Art" ||
            addon.price !== 20000 ||
            !addon.active ||
            ![15, 30].includes(addon.estimatedDuration)
        ) {
            throw new Error(
                "STOP: Add-on does not match the verified audit."
            );
        }

        if (addon.estimatedDuration === 30) {
            const updated = await tx.addon.updateMany({
                where: {
                    id: 6,
                    nameEs: "Diseño Elaborado",
                    nameEn: "Detailed Nail Art",
                    price: 20000,
                    active: true,
                    estimatedDuration: 30,
                },
                data: {
                    estimatedDuration: 15,
                },
            });

            if (updated.count !== 1) {
                throw new Error(
                    "STOP: Add-on changed during update."
                );
            }
        }

        const verified = await tx.addon.findUniqueOrThrow({
            where: { id: 6 },
            select: {
                id: true,
                nameEs: true,
                nameEn: true,
                price: true,
                estimatedDuration: true,
                active: true,
            },
        });

        if (
            verified.estimatedDuration !== 15 ||
            verified.price !== 20000
        ) {
            throw new Error("STOP: Verification failed.");
        }

        return verified;
    });

    console.table([result]);
    console.log("Development add-on update completed.");
    console.log("Historical appointments were not modified.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });