import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getExpenseStaff } from "@/lib/expenses/staff-auth";
import { lockCashbox } from "@/lib/cashbox/lock";
import { calculateCashboxBalance } from "@/lib/cashbox/balance";
import { isCashboxWriteEnabled } from "@/lib/cashbox/is-write-enabled";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "private, no-store",
};

type PurchaseMode = "NEW_CASH" | "EXISTING_CASH" | "NON_CASH";
type PaymentMethod = "CASH" | "BOLD" | "TRANSFER" | "OTHER";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date
    : null;
}

export async function POST(request: Request) {
  const staff = await getExpenseStaff();

  if (!staff.success) {
    return Response.json(
      { error: staff.error },
      { status: staff.status, headers },
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

  const mode = input.mode;
  const amount = input.amount;
  const categoryId = input.categoryId;
  const idempotencyKey = input.idempotencyKey;
  const expenseDate = parseDate(input.expenseDate);
  const paymentMethod = input.paymentMethod;
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const supplier =
    typeof input.supplier === "string" ? input.supplier.trim() : "";

  const existingCashMovementId = input.existingCashMovementId;

  if (
    !["NEW_CASH", "EXISTING_CASH", "NON_CASH"].includes(String(mode)) ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647 ||
    typeof categoryId !== "number" ||
    !Number.isSafeInteger(categoryId) ||
    categoryId <= 0 ||
    !expenseDate ||
    description.length < 2 ||
    description.length > 300 ||
    supplier.length > 150 ||
    typeof idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    ) ||
    !["CASH", "BOLD", "TRANSFER", "OTHER"].includes(String(paymentMethod)) ||
    (mode !== "NON_CASH" && paymentMethod !== "CASH") ||
    (mode === "NON_CASH" && paymentMethod === "CASH") ||
    (mode === "EXISTING_CASH" &&
      (typeof existingCashMovementId !== "number" ||
        !Number.isSafeInteger(existingCashMovementId) ||
        existingCashMovementId <= 0)) ||
    (mode !== "EXISTING_CASH" && existingCashMovementId != null)
  ) {
    return Response.json(
      { error: "Datos de compra inválidos." },
      { status: 400, headers },
    );
  }

  const purchaseMode = mode as PurchaseMode;
  const method = paymentMethod as PaymentMethod;
  const purchaseAmount = amount as number;
  const purchaseCategoryId = categoryId as number;
  const requestKey = idempotencyKey as string;

  if (purchaseMode !== "NON_CASH" && !isCashboxWriteEnabled()) {
    return Response.json(
      { error: "Los registros de caja no están disponibles." },
      { status: 503, headers },
    );
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Use the same lock as the existing Cashbox writers.
        await lockCashbox(tx);

        // Check the current account inside the transaction.
        const user = await tx.user.findUnique({
          where: { id: staff.userId },
          select: { active: true, role: true },
        });

        if (!user?.active || user.role !== staff.role) {
          return {
            ok: false as const,
            status: 403,
            error: "Usuario no autorizado.",
          };
        }

        const previous = await tx.expense.findUnique({
          where: { idempotencyKey: requestKey },
          select: {
            id: true,
            amount: true,
            categoryId: true,
            description: true,
            supplier: true,
            expenseDate: true,
            paymentMethod: true,
            createdById: true,
            cashMovementId: true,
          },
        });

        if (previous) {
          const expectedCash =
            purchaseMode === "NEW_CASH" || purchaseMode === "EXISTING_CASH";

          const previousMovement = previous.cashMovementId
            ? await tx.cashMovement.findUnique({
                where: { id: previous.cashMovementId },
                select: {
                  id: true,
                  idempotencyKey: true,
                },
              })
            : null;

          const samePurchaseMode =
            purchaseMode === "NEW_CASH"
              ? previousMovement?.idempotencyKey === requestKey
              : purchaseMode === "EXISTING_CASH"
                ? previousMovement?.idempotencyKey !== requestKey &&
                  previous.cashMovementId === existingCashMovementId
                : previous.cashMovementId === null;

          const sameRequest =
            samePurchaseMode &&
            previous.createdById === staff.userId &&
            previous.amount === purchaseAmount &&
            previous.categoryId === purchaseCategoryId &&
            previous.description === description &&
            (previous.supplier ?? "") === supplier &&
            previous.expenseDate.getTime() === expenseDate.getTime() &&
            previous.paymentMethod === method &&
            (expectedCash
              ? previous.cashMovementId !== null
              : previous.cashMovementId === null) &&
            (purchaseMode !== "EXISTING_CASH" ||
              previous.cashMovementId === existingCashMovementId);

          if (!sameRequest) {
            return {
              ok: false as const,
              status: 409,
              error: "Esta referencia pertenece a otra compra.",
            };
          }

          return {
            ok: true as const,
            duplicate: true,
            expenseId: previous.id,
            cashMovementId: previous.cashMovementId,
          };
        }

        // Preserve retries of previously submitted purchases,
        // but do not allow new purchases to link old Caja withdrawals.
        if (purchaseMode === "EXISTING_CASH") {
          return {
            ok: false as const,
            status: 400,
            error: "Las compras nuevas deben registrarse directamente en Caja.",
          };
        }

        const category = await tx.expenseCategory.findUnique({
          where: { id: purchaseCategoryId },
          select: { active: true },
        });

        if (!category?.active) {
          return {
            ok: false as const,
            status: 400,
            error: "La categoría no está disponible.",
          };
        }

        let cashMovementId: number | null = null;

        if (purchaseMode === "NEW_CASH") {
          const cashbox = await tx.cashbox.findUnique({
            where: { id: 1 },
            select: {
              id: true,
              openingBalance: true,
              openedAt: true,
            },
          });

          if (!cashbox) {
            return {
              ok: false as const,
              status: 409,
              error: "La caja todavía no está activada.",
            };
          }

          const current = await calculateCashboxBalance(tx, cashbox);

          if (current.balance < purchaseAmount) {
            return {
              ok: false as const,
              status: 409,
              error: "Saldo de caja insuficiente.",
            };
          }

          const movement = await tx.cashMovement.create({
            data: {
              cashboxId: cashbox.id,
              type: "CASH_EXPENSE",
              amount: -purchaseAmount,
              description,
              recordedById: staff.userId,
              idempotencyKey: requestKey,
            },
            select: { id: true },
          });

          cashMovementId = movement.id;
        }

        const expense = await tx.expense.create({
          data: {
            categoryId: purchaseCategoryId,
            description,
            supplier: supplier || null,
            amount: purchaseAmount,
            expenseDate,
            paidAt: expenseDate,
            paymentStatus: "PAID",
            paymentMethod: method,
            reviewStatus: "PENDING_REVIEW",
            createdById: staff.userId,
            cashMovementId,
            idempotencyKey: requestKey,
          },
          select: { id: true },
        });

        return {
          ok: true as const,
          duplicate: false,
          expenseId: expense.id,
          cashMovementId,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    if (!result.ok) {
      return Response.json(
        { error: result.error },
        { status: result.status, headers },
      );
    }

    return Response.json(
      {
        success: true,
        duplicate: result.duplicate,
        expenseId: result.expenseId,
        cashMovementId: result.cashMovementId,
      },
      { status: result.duplicate ? 200 : 201, headers },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    ) {
      return Response.json(
        {
          error:
            "La compra cambió durante el registro. Reintenta con la misma referencia.",
        },
        { status: 409, headers },
      );
    }

    console.error("Failed to register unified purchase:", error);

    return Response.json(
      { error: "No se pudo registrar la compra." },
      { status: 500, headers },
    );
  }
}
