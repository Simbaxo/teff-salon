import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    // Services that can receive a Retiro complemento.
    const compatibleServiceIds = [1, 2, 3, 4, 5, 6, 7, 10, 11, 20];

    // Reuse the existing Retiro add-on as Retiro de Semipermanente.
    const semiRetiro = await prisma.addon.update({
        where: {
            id: 2,
        },
        data: {
            nameEs: "Retiro de Semipermanente",
            nameEn: "Gel Polish Removal",
            price: 10_000,
            estimatedDuration: 10,
            active: true,
        },
    });

    // Create or reuse the acrylic/extensions removal add-on.
    let acrylicRetiro = await prisma.addon.findFirst({
        where: {
            nameEs: "Retiro de Acrílico / Extensiones",
        },
    });

    if (!acrylicRetiro) {
        acrylicRetiro = await prisma.addon.create({
            data: {
                nameEs: "Retiro de Acrílico / Extensiones",
                nameEn: "Acrylic / Extension Removal",
                price: 20_000,
                estimatedDuration: 30,
                active: true,
            },
        });
    } else {
        acrylicRetiro = await prisma.addon.update({
            where: {
                id: acrylicRetiro.id,
            },
            data: {
                price: 20_000,
                estimatedDuration: 30,
                active: true,
            },
        });
    }

    // Connect both Retiro add-ons to compatible nail services.
    for (const serviceId of compatibleServiceIds) {
        await prisma.serviceAddon.upsert({
            where: {
                serviceId_addonId: {
                    serviceId,
                    addonId: semiRetiro.id,
                },
            },
            update: {},
            create: {
                serviceId,
                addonId: semiRetiro.id,
            },
        });

        await prisma.serviceAddon.upsert({
            where: {
                serviceId_addonId: {
                    serviceId,
                    addonId: acrylicRetiro.id,
                },
            },
            update: {},
            create: {
                serviceId,
                addonId: acrylicRetiro.id,
            },
        });
    }

    // Preserve old Retiro services for historical records,
    // but hide them from new bookings.
    await prisma.service.updateMany({
        where: {
            id: {
                in: [17, 18],
            },
        },
        data: {
            active: false,
        },
    });

    console.log("Retiro complementos configured successfully.");
    console.log({
        semiRetiroId: semiRetiro.id,
        acrylicRetiroId: acrylicRetiro.id,
    });
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });