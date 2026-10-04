import "dotenv/config";
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

type ImportItem = {
    sourceRow: number;
    name: string;
    category: string | null;
    unit: string;
    quantity: number;
    lowStockThreshold: number;
    notes: string | null;
    originalCategory: string | null;
    brand: string | null;
    originalProduct: string | null;
    originalStatus: string | null;
};

const APPLY = process.argv.includes("--apply");

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

function normalizeName(value: string) {
    return value.trim().toLocaleLowerCase("es-CO");
}

async function main() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not configured.");
    }

    const items = JSON.parse(
        fs.readFileSync(
            "scripts/data/teff-inventory-import.json",
            "utf8"
        )
    ) as ImportItem[];

    console.log(
        APPLY
            ? "⚠️ APPLY MODE — database changes are enabled"
            : "🔎 DRY RUN — no database changes will be made"
    );

    console.log(`Source records: ${items.length}`);

    // Inventory movements require a real authenticated TEFF user.
    const owners = await prisma.user.findMany({
        where: {
            role: "OWNER",
            active: true,
        },
        select: {
            id: true,
            name: true,
            email: true,
        },
    });

    if (owners.length !== 1) {
        throw new Error(
            `Expected exactly 1 active OWNER, found ${owners.length}.`
        );
    }

    const owner = owners[0];

    console.log(
        `Import audit user: ${owner.name} (${owner.email})`
    );

    const existingItems =
        await prisma.inventoryItem.findMany({
            select: {
                id: true,
                name: true,
                active: true,
            },
        });

    const existingNames = new Set(
        existingItems.map((item) =>
            normalizeName(item.name)
        )
    );

    const seenImportNames = new Set<string>();

    const ready: ImportItem[] = [];
    const duplicates: ImportItem[] = [];

    for (const item of items) {
        const normalizedName =
            normalizeName(item.name);

        if (
            existingNames.has(normalizedName) ||
            seenImportNames.has(normalizedName)
        ) {
            duplicates.push(item);
            continue;
        }

        seenImportNames.add(normalizedName);
        ready.push(item);
    }

    console.log("");
    console.log("Import preview");
    console.log("--------------");
    console.log(`Ready to import: ${ready.length}`);
    console.log(`Skipped duplicates: ${duplicates.length}`);

    if (duplicates.length > 0) {
        console.log("");
        console.log("Duplicates:");

        for (const item of duplicates) {
            console.log(
                `- Row ${item.sourceRow}: ${item.name}`
            );
        }
    }

    if (!APPLY) {
        console.log("");
        console.log(
            "Dry run complete. No database changes were made."
        );
        console.log(
            "Run again with --apply only after reviewing this output."
        );
        return;
    }

    let imported = 0;

    for (const item of ready) {
        await prisma.$transaction(async (tx) => {
            /*
             * Start at zero so the imported quantity is represented
             * by an auditable initial CORRECTION movement.
             */
            const created =
                await tx.inventoryItem.create({
                    data: {
                        name: item.name,
                        category: item.category,
                        unit: item.unit,
                        quantity: 0,
                        lowStockThreshold:
                            item.lowStockThreshold,
                        notes: item.notes,
                        active: true,
                    },
                });

            if (item.quantity > 0) {
                await tx.inventoryItem.update({
                    where: {
                        id: created.id,
                    },
                    data: {
                        quantity: item.quantity,
                    },
                });

                await tx.inventoryMovement.create({
                    data: {
                        inventoryItemId: created.id,
                        userId: owner.id,
                        type: "CORRECTION",
                        quantityChange: item.quantity,
                        quantityBefore: 0,
                        quantityAfter: item.quantity,
                        note:
                            "Inventario inicial — importación",
                    },
                });
            }
        });

        imported++;

        if (
            imported % 25 === 0 ||
            imported === ready.length
        ) {
            console.log(
                `Imported ${imported}/${ready.length}`
            );
        }
    }

    console.log("");
    console.log("✅ Inventory import complete.");
    console.log(`Imported: ${imported}`);
    console.log(`Skipped duplicates: ${duplicates.length}`);
}

main()
    .catch((error) => {
        console.error("");
        console.error("❌ Inventory import failed:");
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });