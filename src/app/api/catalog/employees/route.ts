import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const employees = await prisma.employee.findMany({
      where: {
        active: true,
        compensationType: "COMMISSION",
      },
      select: {
        id: true,
        name: true,
        isBookable: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return Response.json(employees);
  } catch (error) {
    console.error("Failed to load catalog employees:", error);

    return Response.json(
      {
        error: "No se pudo cargar el personal disponible.",
      },
      { status: 500 },
    );
  }
}
