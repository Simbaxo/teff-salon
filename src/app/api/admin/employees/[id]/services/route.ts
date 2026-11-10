import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const employeeId = Number(id);

  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
    return Response.json(
      { error: "ID de empleado inválido." },
      { status: 400 },
    );
  }

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        active: true,
        isBookable: true,
        compensationType: true,
        employeeServices: {
          select: {
            serviceId: true,
          },
        },
      },
    });

    if (!employee) {
      return Response.json(
        { error: "Empleado no encontrado." },
        { status: 404 },
      );
    }

    const services = await prisma.service.findMany({
      select: {
        id: true,
        nameEs: true,
        category: true,
        active: true,
      },
      orderBy: [{ category: "asc" }, { nameEs: "asc" }],
    });

    const assignedIds = new Set(
      employee.employeeServices.map((item) => item.serviceId),
    );

    return Response.json({
      employee: {
        id: employee.id,
        name: employee.name,
        active: employee.active,
        isBookable: employee.isBookable,
        compensationType: employee.compensationType,
      },
      services: services.map((service) => ({
        id: service.id,
        nameEs: service.nameEs,
        category: service.category,
        active: service.active,
        assigned: assignedIds.has(service.id),
      })),
    });
  } catch (error) {
    console.error("Failed to load employee qualifications:", error);

    return Response.json(
      {
        error: "No se pudieron cargar los servicios del empleado.",
      },
      { status: 500 },
    );
  }
}
export async function POST(request: Request, { params }: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const employeeId = Number(id);

  if (!Number.isSafeInteger(employeeId) || employeeId <= 0) {
    return Response.json(
      { error: "ID de empleado inválido." },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Información inválida." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;

  if (
    Object.keys(data).length !== 1 ||
    !Number.isSafeInteger(data.serviceId) ||
    (data.serviceId as number) <= 0
  ) {
    return Response.json(
      { error: "ID de servicio inválido." },
      { status: 400 },
    );
  }

  const serviceId = data.serviceId as number;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const employee = await tx.employee.findUnique({
          where: { id: employeeId },
          select: {
            id: true,
            active: true,
            compensationType: true,
          },
        });

        if (!employee) {
          return { status: 404, error: "Empleado no encontrado." };
        }

        if (!employee.active || employee.compensationType !== "COMMISSION") {
          return {
            status: 400,
            error: "Empleado no elegible para servicios.",
          };
        }

        const service = await tx.service.findUnique({
          where: { id: serviceId },
          select: {
            id: true,
            active: true,
          },
        });

        if (!service) {
          return { status: 404, error: "Servicio no encontrado." };
        }

        if (!service.active) {
          return {
            status: 400,
            error: "No se pueden asignar servicios inactivos.",
          };
        }

        const qualification = await tx.employeeService.upsert({
          where: {
            employeeId_serviceId: {
              employeeId,
              serviceId,
            },
          },
          update: {},
          create: {
            employeeId,
            serviceId,
          },
        });

        return {
          status: 200,
          qualification,
        };
      },
      {
        isolationLevel: "ReadCommitted",
        maxWait: 15000,
        timeout: 20000,
      },
    );

    if ("error" in result) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json(result.qualification);
  } catch (error) {
    console.error("Failed to assign employee service:", error);

    return Response.json(
      { error: "No se pudo asignar el servicio." },
      { status: 500 },
    );
  }
}
