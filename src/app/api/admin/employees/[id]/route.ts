import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
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
    Object.keys(data).length === 0 ||
    Object.keys(data).some((key) => !["active", "isBookable"].includes(key)) ||
    (data.active !== undefined && typeof data.active !== "boolean") ||
    (data.isBookable !== undefined && typeof data.isBookable !== "boolean")
  ) {
    return Response.json(
      { error: "Estado del empleado inválido." },
      { status: 400 },
    );
  }

  try {
    const employee = await prisma.$transaction(
      async (tx) => {
        // Coordinate with public booking creation.
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(73421, ${employeeId})
        `;

        const existing = await tx.employee.findUnique({
          where: { id: employeeId },
          select: {
            id: true,
            active: true,
            isBookable: true,
            compensationType: true,
          },
        });

        if (!existing) {
          throw new Error("EMPLOYEE_NOT_FOUND");
        }

        const nextActive: boolean =
          typeof data.active === "boolean" ? data.active : existing.active;

        const nextBookable: boolean = !nextActive
          ? false
          : typeof data.isBookable === "boolean"
            ? data.isBookable
            : existing.isBookable;

        if (existing.compensationType === "FIXED_WEEKLY" && nextBookable) {
          throw new Error("INVALID_BOOKING_CONFIGURATION");
        }

        if (existing.active && !nextActive) {
          // Appointments store calendar dates at UTC midnight.
          // Include overdue unfinished appointments as well.
          const unfinished = await tx.appointment.count({
            where: {
              employeeId,
              status: {
                in: ["REQUESTED", "BOOKED", "CHECKED_IN", "IN_PROGRESS"],
              },
            },
          });

          if (unfinished > 0) {
            throw new Error("UNFINISHED_APPOINTMENTS");
          }
        }

        return tx.employee.update({
          where: { id: employeeId },
          data: {
            active: nextActive,
            isBookable: nextBookable,
          },
          select: {
            id: true,
            name: true,
            active: true,
            isBookable: true,
            compensationType: true,
          },
        });
      },
      {
        isolationLevel: "ReadCommitted",
        maxWait: 10000,
        timeout: 15000,
      },
    );

    return Response.json(employee);
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYEE_NOT_FOUND") {
      return Response.json(
        { error: "Empleado no encontrado." },
        { status: 404 },
      );
    }

    if (error instanceof Error && error.message === "UNFINISHED_APPOINTMENTS") {
      return Response.json(
        {
          error:
            "Este empleado tiene citas pendientes. Reasígnalas o resuélvelas antes de desactivarlo.",
        },
        { status: 409 },
      );
    }

    if (
      error instanceof Error &&
      error.message === "INVALID_BOOKING_CONFIGURATION"
    ) {
      return Response.json(
        { error: "Configuración de reservas inválida." },
        { status: 400 },
      );
    }

    console.error("Failed to update employee status:", error);

    return Response.json(
      { error: "No se pudo actualizar el empleado." },
      { status: 500 },
    );
  }
}
