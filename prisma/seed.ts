import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    // TEFF currently uses one salon settings row.
    // Later this can expand to support multiple locations.
    const existingSettings = await prisma.salonSettings.findFirst();

    if (existingSettings) {
        await prisma.salonSettings.update({
            where: {
                id: existingSettings.id,
            },
            data: {
                weeklySalesGoal: 5_000_000,
                monthlySalesGoal: 20_000_000,
            },
        });

        console.log("TEFF salon settings updated.");
        return;
    }

    await prisma.salonSettings.create({
        data: {
            weeklySalesGoal: 5_000_000,
            monthlySalesGoal: 20_000_000,
        },
    });

    console.log("TEFF salon settings created.");
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });