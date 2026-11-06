import { prisma } from "@/lib/prisma";
import { getExpenseOwner } from "@/lib/expenses/owner-auth";

export async function GET() {
  const owner = await getExpenseOwner();

  if (!owner.success) {
    return Response.json({ error: owner.error }, { status: owner.status });
  }

  const categories = await prisma.expenseCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return Response.json(
    { categories },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const owner = await getExpenseOwner();

  if (!owner.success) {
    return Response.json({ error: owner.error }, { status: owner.status });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (name.length < 2 || name.length > 80) {
    return Response.json(
      { error: "El nombre debe tener entre 2 y 80 caracteres." },
      { status: 400 },
    );
  }

  try {
    const category = await prisma.expenseCategory.create({
      data: {
        name,
      },
    });

    return Response.json({ category }, { status: 201 });
  } catch (error) {
    console.error("Failed to create expense category:", error);

    return Response.json(
      { error: "No se pudo crear la categoría. Verifica que no exista." },
      { status: 409 },
    );
  }
}
