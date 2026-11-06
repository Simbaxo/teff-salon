import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getExpenseOwner } from "@/lib/expenses/owner-auth";

const headers = { "Cache-Control": "private, no-store" };

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
  const month = input.month;

  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return Response.json(
      { error: "Mes inválido. Usa YYYY-MM." },
      { status: 400, headers },
    );
  }

  const [year, monthNumber] = month.split("-").map(Number);

  const recurringMonth = new Date(Date.UTC(year, monthNumber - 1, 1));

  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const templates = await tx.recurringExpense.findMany({
          where: {
            active: true,
            startMonth: {
              lte: recurringMonth,
            },
            category: { active: true },
          },
          select: {
            id: true,
            categoryId: true,
            name: true,
            amount: true,
            dayOfMonth: true,
          },
        });

        const data = templates.map((template) => ({
          categoryId: template.categoryId,
          recurringExpenseId: template.id,
          recurringMonth,
          description: template.name,
          amount: template.amount,
          expenseDate: new Date(
            Date.UTC(
              year,
              monthNumber - 1,
              Math.min(template.dayOfMonth, daysInMonth),
            ),
          ),
          reviewStatus: "PENDING_REVIEW" as const,
          paymentStatus: "UNPAID" as const,
          createdById: owner.ownerId,
        }));

        if (data.length === 0) {
          return { created: 0, existing: 0 };
        }

        const created = await tx.expense.createMany({
          data,
          skipDuplicates: true,
        });

        return {
          created: created.count,
          existing: data.length - created.count,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return Response.json(
      {
        success: true,
        month,
        ...result,
      },
      { headers },
    );
  } catch (error) {
    console.error("Failed to generate recurring expenses:", error);

    return Response.json(
      { error: "No se pudieron generar los gastos recurrentes." },
      { status: 500, headers },
    );
  }
}
