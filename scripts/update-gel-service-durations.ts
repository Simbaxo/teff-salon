
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.TEST_DATABASE_URL;

if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is missing.");
}

const endpoint = new URL(connectionString).hostname
    .replace(/-pooler(?=\.)/, "");

const approvedEndpoint =
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech";

if (endpoint !== approvedEndpoint) {
    throw new Error("STOP: Development database only.");
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
});

async function main() {
    const result = await prisma.$transaction(async (tx) => {
        const expected = [
            { id: 1, nameEs: "Manicura Gel" },
            { id: 2, nameEs: "Pedicura Gel" },
        ];

        const services = await tx.service.findMany({
            where: { id: { in: [1, 2] } },
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
            services.length !== 2 ||
            expected.some(({ id, nameEs }) =>
                !services.some(
                    (s) =>
                        s.id === id &&
                        s.nameEs === nameEs &&
                        s.price === 60000 &&
                        s.active === true &&
                        [60, 80].includes(s.estimatedDuration)
                )
            )
        ) {
            throw new Error(
                "STOP: Service records differ from the verified audit."
            );
        }

        for (const service of services) {
            if (service.estimatedDuration === 60) continue;

            const updated = await tx.service.updateMany({
                where: {
                    id: service.id,
                    nameEs: service.nameEs,
                    estimatedDuration: 80,
                    price: 60000,
                    active: true,
                },
                data: {
                    estimatedDuration: 60,
                },
            });

            if (updated.count !== 1) {
                throw new Error(
                    `STOP: Concurrent change to service ${service.id}`
                );
            }
        }

        return tx.service.findMany({
            where: { id: { in: [1, 2] } },
            select: {
                id: true,
                nameEs: true,
                estimatedDuration: true,
                price: true,
            },
            orderBy: { id: "asc" },
        });
    });

    console.table(result);
    console.log("Development catalog update completed.");
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