import { prisma } from "@/lib/prisma";

export async function GET() {
  const serviceAddons = await prisma.serviceAddon.findMany({
    orderBy: [
      {
        serviceId: "asc",
      },
      {
        addonId: "asc",
      },
    ],
  });

  return Response.json(serviceAddons);
}