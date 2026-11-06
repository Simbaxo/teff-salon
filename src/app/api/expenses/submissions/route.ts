import { prisma } from "@/lib/prisma";
import { getExpenseStaff } from "@/lib/expenses/staff-auth";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

function parseExpenseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
}

export async function GET(request: Request) {
  const staff = await getExpenseStaff();

  if (!staff.success) {
    return Response.json(
      { error: staff.error },
      { status: staff.status, headers: noStoreHeaders },
    );
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month");

  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json(
      { error: "Mes inválido. Usa YYYY-MM." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  try {
    const expenses = await prisma.expense.findMany({
      where: {
        expenseDate: {
          gte: start,
          lt: end,
        },
        ...(staff.role === "RECEPTIONIST" ? { createdById: staff.userId } : {}),
      },
      select: {
        id: true,
        categoryId: true,
        description: true,
        supplier: true,
        amount: true,
        expenseDate: true,
        paymentStatus: true,
        paymentMethod: true,
        paidAt: true,
        reviewStatus: true,
        createdAt: true,
        createdById: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        receipts: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ expenseDate: "desc" }, { id: "desc" }],
      take: 500,
    });

    return Response.json({ month, expenses }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Failed to load expense submissions:", error);

    return Response.json(
      { error: "No se pudieron consultar los gastos." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

export async function POST(request: Request) {
  const staff = await getExpenseStaff();

  if (!staff.success) {
    return Response.json(
      { error: staff.error },
      { status: staff.status, headers: noStoreHeaders },
    );
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Solicitud inválida." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const input = body as Record<string, unknown>;

  const categoryId = input.categoryId;
  const amount = input.amount;
  const expenseDate = parseExpenseDate(input.expenseDate);

  const description =
    typeof input.description === "string" ? input.description.trim() : "";

  const supplier =
    typeof input.supplier === "string" ? input.supplier.trim() : "";

  const paymentStatus = input.paymentStatus ?? "UNPAID";
  const paymentMethod = input.paymentMethod ?? null;

  const paidDate =
    input.paidDate === undefined || input.paidDate === null
      ? null
      : parseExpenseDate(input.paidDate);

  if (
    typeof categoryId !== "number" ||
    !Number.isSafeInteger(categoryId) ||
    categoryId <= 0 ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647 ||
    !expenseDate ||
    description.length < 2 ||
    description.length > 300 ||
    supplier.length > 150 ||
    !["UNPAID", "PAID"].includes(String(paymentStatus)) ||
    (paymentMethod !== null &&
      !["CASH", "BOLD", "TRANSFER", "OTHER"].includes(String(paymentMethod))) ||
    (paymentStatus === "PAID" && paymentMethod === null) ||
    (paymentStatus === "UNPAID" && paymentMethod !== null) ||
    (paymentStatus === "PAID" && paidDate === null) ||
    (paymentStatus === "UNPAID" && input.paidDate != null)
  ) {
    return Response.json(
      { error: "Datos del gasto inválidos." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId as number },
      select: {
        id: true,
        active: true,
      },
    });

    if (!category?.active) {
      return Response.json(
        { error: "La categoría no está disponible." },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const expense = await prisma.expense.create({
      data: {
        categoryId: category.id,
        description,
        supplier: supplier || null,
        amount: amount as number,
        expenseDate,
        reviewStatus: "PENDING_REVIEW",
        paymentStatus: paymentStatus as "PAID" | "UNPAID",
        paymentMethod: paymentMethod as
          "CASH" | "BOLD" | "TRANSFER" | "OTHER" | null,
        paidAt: paymentStatus === "PAID" ? paidDate : null,
        createdById: staff.userId,
      },
    });

    return Response.json(
      { success: true, expense },
      { status: 201, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to create expense submission:", error);

    return Response.json(
      { error: "No se pudo registrar el gasto." },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
