import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const employees = await prisma.employee.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        active: true,
        isBookable: true,
        compensationType: true,
        weeklySalary: true,
        salaryStartDate: true,
      },
    });

    return Response.json(employees);
  } catch (error) {
    console.error("Failed to load employee management:", error);

    return Response.json(
      { error: "No se pudo cargar el personal." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json(
      { error: "Información del empleado inválida." },
      { status: 400 },
    );
  }

  const data = body as Record<string, unknown>;

  const name =
    typeof data.name === "string" ? data.name.trim().replace(/\s+/g, " ") : "";

  const compensationType = data.compensationType;

  if (
    name.length < 2 ||
    name.length > 100 ||
    !["COMMISSION", "FIXED_WEEKLY"].includes(String(compensationType))
  ) {
    return Response.json(
      { error: "Nombre o tipo de compensación inválido." },
      { status: 400 },
    );
  }

  const weeklySalary =
    compensationType === "FIXED_WEEKLY" ? data.weeklySalary : 0;

  if (
    !Number.isSafeInteger(weeklySalary) ||
    (weeklySalary as number) < 0 ||
    (compensationType === "FIXED_WEEKLY" && (weeklySalary as number) === 0)
  ) {
    return Response.json(
      { error: "Salario semanal inválido." },
      { status: 400 },
    );
  }

  if (data.active !== undefined && data.active !== true) {
    return Response.json(
      { error: "Los empleados nuevos deben estar activos." },
      { status: 400 },
    );
  }

  if (data.isBookable !== undefined && typeof data.isBookable !== "boolean") {
    return Response.json(
      { error: "Disponibilidad para reservas inválida." },
      { status: 400 },
    );
  }

  const isBookable = data.isBookable === true;

  if (compensationType === "FIXED_WEEKLY" && isBookable) {
    return Response.json(
      {
        error:
          "La configuración de reservas para empleados con salario fijo requiere revisión.",
      },
      { status: 400 },
    );
  }

  try {
    const employee = await prisma.$transaction(async (tx) => {
      // Serialize employee creation to reduce duplicate-name races.
      await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(73421, 1)
        `;

      const existingEmployees = await tx.employee.findMany({
        select: {
          id: true,
          name: true,
        },
      });

      const duplicate = existingEmployees.some(
        (employee) =>
          employee.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
      );

      if (duplicate) {
        throw new Error("DUPLICATE_EMPLOYEE");
      }

      return tx.employee.create({
        data: {
          name,
          active: true,
          isBookable,
          compensationType:
            compensationType === "FIXED_WEEKLY" ? "FIXED_WEEKLY" : "COMMISSION",
          weeklySalary: weeklySalary as number,
        },
        select: {
          id: true,
          name: true,
          active: true,
          isBookable: true,
          compensationType: true,
          weeklySalary: true,
        },
      });
    });

    return Response.json(employee, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_EMPLOYEE") {
      return Response.json(
        { error: "Ya existe un empleado con ese nombre." },
        { status: 409 },
      );
    }

    console.error("Failed to create employee:", error);

    return Response.json(
      { error: "No se pudo crear el empleado." },
      { status: 500 },
    );
  }
}
