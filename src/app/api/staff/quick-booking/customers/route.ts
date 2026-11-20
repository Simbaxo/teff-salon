import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, 100);

  const phoneDigits = /^[+\d\s().-]+$/.test(query)
    ? query.replace(/\D/g, "")
    : "";

  const canSearch = phoneDigits ? phoneDigits.length >= 3 : query.length >= 2;

  const headers = {
    "Cache-Control": "no-store",
  };

  if (!canSearch) {
    return Response.json({ customers: [] }, { headers });
  }

  try {
    const customers = await prisma.customer.findMany({
      where: phoneDigits
        ? {
            phone: {
              contains: phoneDigits,
            },
          }
        : {
            name: {
              contains: query,
              mode: "insensitive",
            },
          },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 20,
    });

    return Response.json({ customers }, { headers });
  } catch (error) {
    console.error(
      "Quick booking customer search failed:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return Response.json(
      { error: "No se pudieron buscar los clientes." },
      { status: 500, headers },
    );
  }
}
