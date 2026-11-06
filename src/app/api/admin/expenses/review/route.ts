import { prisma } from "@/lib/prisma";
import { getExpenseOwner } from "@/lib/expenses/owner-auth";

const headers = {
  "Cache-Control": "private, no-store",
};

type ReviewAction = "APPROVE" | "REJECT" | "REOPEN";

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

  const expenseId = input.expenseId;
  const action = input.action;

  if (
    typeof expenseId !== "number" ||
    !Number.isSafeInteger(expenseId) ||
    expenseId <= 0 ||
    !["APPROVE", "REJECT", "REOPEN"].includes(String(action))
  ) {
    return Response.json(
      { error: "Datos de revisión inválidos." },
      { status: 400, headers },
    );
  }

  const reviewAction = action as ReviewAction;

  const targetStatus =
    reviewAction === "APPROVE"
      ? "APPROVED"
      : reviewAction === "REJECT"
        ? "REJECTED"
        : "PENDING_REVIEW";

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Coordinate expense approval with concurrent receipt uploads.
      // Both operations must lock the same Expense row.
      await tx.$queryRaw`
        SELECT id
        FROM "Expense"
        WHERE id = ${expenseId}
        FOR UPDATE
      `;

      const expense = await tx.expense.findUnique({
        where: { id: expenseId },
        select: {
          id: true,
          reviewStatus: true,
        },
      });

      if (!expense) {
        return { error: "Gasto no encontrado.", status: 404 };
      }

      if (expense.reviewStatus === targetStatus) {
        return {
          success: true,
          duplicate: true,
          expenseId: expense.id,
          reviewStatus: targetStatus,
        };
      }

      const updated = await tx.expense.updateMany({
        where: {
          id: expense.id,
          reviewStatus: expense.reviewStatus,
        },
        data: {
          reviewStatus: targetStatus,
          reviewedById:
            targetStatus === "PENDING_REVIEW" ? null : owner.ownerId,
          reviewedAt: targetStatus === "PENDING_REVIEW" ? null : new Date(),
        },
      });

      if (updated.count !== 1) {
        return {
          error: "El gasto cambió durante la revisión. Actualiza la página.",
          status: 409,
        };
      }

      return {
        success: true,
        duplicate: false,
        expenseId: expense.id,
        reviewStatus: targetStatus,
      };
    });

    if ("error" in result) {
      return Response.json(
        { error: result.error },
        { status: result.status, headers },
      );
    }

    return Response.json(result, { headers });
  } catch (error) {
    console.error("Failed to review expense:", error);

    return Response.json(
      { error: "No se pudo actualizar la revisión del gasto." },
      { status: 500, headers },
    );
  }
}
