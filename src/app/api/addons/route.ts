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

  return Response.json(addons);
}