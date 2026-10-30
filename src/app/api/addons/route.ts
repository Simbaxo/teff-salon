import { prisma } from "@/lib/prisma";

export async function GET() {
    const addons = await prisma.addon.findMany({
        where: {
            active: true,
        },
        orderBy: {
            id: "asc",
        },
    });

    // Display Nail Repair first while preserving the
    // original order of all other add-ons.
    const isNailRepair = (addon: (typeof addons)[number]) =>
        addon.nameEs === "Reparación / Alargamiento de Uña" ||
        addon.nameEn === "Nail Repair / Extension";

    const sortedAddons = addons.sort(
        (a, b) => Number(isNailRepair(b)) - Number(isNailRepair(a))
    );

    return Response.json(sortedAddons);
}