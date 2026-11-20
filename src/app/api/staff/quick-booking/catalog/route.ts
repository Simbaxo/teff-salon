import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store",
};

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  // Quick booking is available only to OWNER and RECEPTIONIST.
  if (session.user.role !== "OWNER" && session.user.role !== "RECEPTIONIST") {
    return Response.json({ error: "Forbidden" }, { status: 403, headers });
  }

  try {
    const [services, employees] = await Promise.all([
      prisma.service.findMany({
        where: {
          active: true,
        },
        select: {
          id: true,
          nameEs: true,
          category: true,
          price: true,
          estimatedDuration: true,
          requiresApproval: true,
          employeeServices: {
            where: {
              employee: {
                active: true,
                isBookable: true,
                compensationType: "COMMISSION",
              },
            },
            select: {
              employeeId: true,
            },
          },
        },
        orderBy: [{ category: "asc" }, { nameEs: "asc" }],
      }),

      prisma.employee.findMany({
        where: {
          active: true,
          isBookable: true,
          compensationType: "COMMISSION",
        },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: "asc",
        },
      }),
    ]);

    const catalog = services.map((service) => ({
      id: service.id,
      nameEs: service.nameEs,
      category: service.category,
      price: service.price,
      estimatedDuration: service.estimatedDuration,
      requiresApproval: service.requiresApproval,
      qualifiedEmployeeIds: service.employeeServices.map(
        (assignment) => assignment.employeeId,
      ),
    }));

    return Response.json(
      {
        services: catalog,
        employees,
      },
      { headers },
    );
  } catch (error) {
    console.error(
      "Quick booking catalog failed:",
      error instanceof Error ? error.name : "Unknown error",
    );

    return Response.json(
      {
        error: "No se pudo cargar el catálogo de reservas.",
      },
      { status: 500, headers },
    );
  }
}
