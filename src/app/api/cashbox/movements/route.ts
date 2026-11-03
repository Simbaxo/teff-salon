import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageStaff } from "@/lib/auth-roles";
import { calculateCashboxBalance } from "@/lib/cashbox/balance";
import { lockCashbox } from "@/lib/cashbox/lock";

const allowedTypes = [
  "OWNER_WITHDRAWAL",
  "BANK_DEPOSIT",
  "CASH_EXPENSE",
] as const;

type MovementType = (typeof allowedTypes)[number];

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "No has iniciado sesión." }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json(
      { error: "No tienes permiso para consultar la caja." },
      { status: 403 },
    );
  }

  const userId = Number(session.user.id);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return Response.json({ error: "Usuario inválido." }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        active: true,
        role: true,
      },
    });

    if (!user?.active || !canManageStaff(user.role)) {
      return Response.json(
        { error: "Usuario no autorizado." },
        { status: 403 },
      );
    }

    const cashbox = await prisma.cashbox.findUnique({
      where: { id: 1 },
      select: { id: true },
    });

    if (!cashbox) {
      return Response.json({
        initialized: false,
        movements: [],
      });
    }

    const movements = await prisma.cashMovement.findMany({
      where: {
        cashboxId: cashbox.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        type: true,
        amount: true,
        description: true,
        createdAt: true,
        reversalOfId: true,
        recordedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        employee: {
          select: {
            id: true,
            name: true,
          },
        },
        reversedBy: {
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
    });

    return Response.json({
      initialized: true,
      movements: movements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        amount: movement.amount,
        description: movement.description,
        createdAt: movement.createdAt,
        recordedBy: movement.recordedBy,
        employee: movement.employee,
        reversalOfId: movement.reversalOfId,
        reversedBy: movement.reversedBy,
      })),
    });
  } catch (error) {
    console.error("Failed to load cashbox movements:", error);

    return Response.json(
      { error: "No se pudo consultar el historial de caja." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = Number(session.user.id);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return Response.json({ error: "Usuario inválido." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;

  const { type, amount, idempotencyKey } = input;
  const description =
    typeof input.description === "string" ? input.description.trim() : "";

  if (
    typeof type !== "string" ||
    !allowedTypes.includes(type as MovementType) ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647 ||
    description.length === 0 ||
    description.length > 300 ||
    typeof idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    )
  ) {
    return Response.json(
      { error: "Datos del movimiento inválidos." },
      { status: 400 },
    );
  }

  const movementType = type as MovementType;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await lockCashbox(tx);

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            active: true,
            role: true,
          },
        });

        if (!user?.active || !canManageStaff(user.role)) {
          return {
            ok: false as const,
            error: "Usuario no autorizado.",
            httpStatus: 403,
          };
        }

        // An identical retry must not create a
        // second withdrawal.
        const existing = await tx.cashMovement.findUnique({
          where: { idempotencyKey },
        });

        if (existing) {
          if (
            existing.recordedById !== userId ||
            existing.type !== movementType ||
            existing.amount !== -amount ||
            existing.description !== description
          ) {
            return {
              ok: false as const,
              error: "Esta referencia ya pertenece a otro movimiento.",
              httpStatus: 409,
            };
          }

          return {
            ok: true as const,
            duplicate: true,
            movement: existing,
          };
        }

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
            error: "La caja todavía no está activada.",
            httpStatus: 409,
          };
        }

        const current = await calculateCashboxBalance(tx, cashbox);

        if (current.balance < amount) {
          return {
            ok: false as const,
            error: "El saldo disponible es insuficiente.",
            httpStatus: 409,
          };
        }

        const movement = await tx.cashMovement.create({
          data: {
            cashboxId: cashbox.id,
            type: movementType,
            amount: -amount,
            description,
            recordedById: userId,
            idempotencyKey,
          },
          select: {
            id: true,
            type: true,
            amount: true,
            description: true,
            createdAt: true,
          },
        });

        return {
          ok: true as const,
          duplicate: false,
          movement,
          previousBalance: current.balance,
          newBalance: current.balance - amount,
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
        { status: result.httpStatus },
      );
    }

    return Response.json(
      {
        success: true,
        ...result,
      },
      { status: result.duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2034", "P2002"].includes(error.code)
    ) {
      return Response.json(
        {
          error:
            "La caja cambió durante la operación. Actualiza e inténtalo nuevamente con la misma referencia.",
        },
        { status: 409 },
      );
    }

    console.error("Failed to record cash movement:", error);

    return Response.json(
      { error: "No se pudo registrar el movimiento." },
      { status: 500 },
    );
  }
}
