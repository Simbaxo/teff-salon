import { prisma } from "@/lib/prisma";
import { getExpenseOwner } from "@/lib/expenses/owner-auth";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const owner = await getExpenseOwner();

  if (!owner.success) {
    return Response.json(
      { error: owner.error },
      { status: owner.status, headers },
    );
  }

  try {
    const recurringExpenses = await prisma.recurringExpense.findMany({
      include: {
        category: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    return Response.json({ recurringExpenses }, { headers });
  } catch (error) {
    console.error("Failed to load recurring expenses:", error);
    return Response.json(
      { error: "No se pudieron consultar los gastos recurrentes." },
      { status: 500, headers },
    );
  }
}

export async function POST(request: Request) {
  const owner = await getExpenseOwner();

  if (!owner.success) {
    return Response.json(
      { error: owner.error },
      { status: owner.status, headers },
    );
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Solicitud inválida." },
      { status: 400, headers },
    );
  }

  const input = body as Record<string, unknown>;

  const name = typeof input.name === "string" ? input.name.trim() : "";

  const categoryId = input.categoryId;
  const amount = input.amount;
  const dayOfMonth = input.dayOfMonth;
  const startMonth = input.startMonth;

  if (
    typeof startMonth !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)
  ) {
    return Response.json(
      { error: "Mes de inicio inválido. Usa YYYY-MM." },
      { status: 400, headers },
    );
  }

  const startMonthDate = new Date(`${startMonth}-01T00:00:00.000Z`);

  if (
    name.length < 2 ||
    name.length > 120 ||
    typeof categoryId !== "number" ||
    !Number.isSafeInteger(categoryId) ||
    categoryId <= 0 ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647 ||
    typeof dayOfMonth !== "number" ||
    !Number.isSafeInteger(dayOfMonth) ||
    dayOfMonth < 1 ||
    dayOfMonth > 31
  ) {
    return Response.json(
      { error: "Datos del gasto recurrente inválidos." },
      { status: 400, headers },
    );
  }

  try {
    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, active: true },
    });

    if (!category?.active) {
      return Response.json(
        { error: "La categoría no está disponible." },
        { status: 400, headers },
      );
    }

    const recurringExpense = await prisma.recurringExpense.create({
      data: {
        categoryId: category.id,
        name,
        amount,
        dayOfMonth,
        startMonth: startMonthDate,
        active: true,
      },
    });

    return Response.json(
      { success: true, recurringExpense },
      { status: 201, headers },
    );
  } catch (error) {
    console.error("Failed to create recurring expense:", error);

    return Response.json(
      { error: "No se pudo crear el gasto recurrente." },
      { status: 500, headers },
    );
  }
}
