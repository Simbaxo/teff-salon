import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageStaff } from "@/lib/auth-roles";
import { lockCashbox } from "@/lib/cashbox/lock";
import { calculateCashboxBalance } from "@/lib/cashbox/balance";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "No has iniciado sesión." }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json(
      { error: "No tienes permiso para consultar los conteos." },
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
      return Response.json(
        {
          initialized: false,
          counts: [],
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        },
      );
    }

    const counts = await prisma.cashCount.findMany({
      where: {
        cashboxId: cashbox.id,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        countedAmount: true,
        expectedAmount: true,
        difference: true,
        notes: true,
        createdAt: true,
        countedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return Response.json(
      {
        initialized: true,
        counts,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Failed to load cash counts:", error);

    return Response.json(
      { error: "No se pudo consultar el historial de conteos." },
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

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Datos del conteo inválidos." },
      { status: 400 },
    );
  }

  const input = body as Record<string, unknown>;

  const { countedAmount, expectedAmount, idempotencyKey } = input;

  const notes = typeof input.notes === "string" ? input.notes.trim() : "";

  if (
    typeof countedAmount !== "number" ||
    !Number.isSafeInteger(countedAmount) ||
    countedAmount < 0 ||
    countedAmount > 2147483647 ||
    typeof expectedAmount !== "number" ||
    !Number.isSafeInteger(expectedAmount) ||
    expectedAmount < 0 ||
    typeof input.notes !== "string" ||
    notes.length > 300 ||
    typeof idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    )
  ) {
    return Response.json(
      { error: "Datos del conteo inválidos." },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await lockCashbox(tx);

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { active: true, role: true },
        });

        if (!user?.active || !canManageStaff(user.role)) {
          return {
            ok: false as const,
            status: 403,
            error: "Usuario no autorizado.",
          };
        }

        const existing = await tx.cashCount.findUnique({
          where: { idempotencyKey },
        });

        if (existing) {
          if (
            existing.countedById !== userId ||
            existing.countedAmount !== countedAmount ||
            existing.expectedAmount !== expectedAmount ||
            (existing.notes ?? "") !== notes
          ) {
            return {
              ok: false as const,
              status: 409,
              error: "Esta referencia pertenece a otro conteo.",
            };
          }

          return {
            ok: true as const,
            duplicate: true,
            count: existing,
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
            status: 409,
            error: "La caja todavía no está activada.",
          };
        }

        const balance = await calculateCashboxBalance(tx, cashbox);

        // Never silently save a count against a different expected balance.
        // The user must review the updated balance and confirm again.
        if (balance.balance !== expectedAmount) {
          return {
            ok: false as const,
            status: 409,
            code: "CASHBOX_BALANCE_CHANGED",
            error:
              "El saldo esperado cambió desde que comenzaste el conteo. Actualiza la caja y revisa los valores antes de continuar.",
          };
        }

        const difference = countedAmount - balance.balance;

        if (
          !Number.isSafeInteger(difference) ||
          Math.abs(difference) > 2147483647
        ) {
          return {
            ok: false as const,
            status: 409,
            error: "La diferencia del conteo excede el rango permitido.",
          };
        }

        if (difference !== 0 && !notes) {
          return {
            ok: false as const,
            status: 400,
            error: "Debes explicar la diferencia del conteo.",
          };
        }

        const count = await tx.cashCount.create({
          data: {
            cashboxId: cashbox.id,
            countedById: userId,
            countedAmount,
            expectedAmount: balance.balance,
            difference,
            notes: notes || null,
            idempotencyKey,
          },
        });

        return {
          ok: true as const,
          duplicate: false,
          count,
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
        {
          error: result.error,
          code: "code" in result ? result.code : undefined,
        },
        { status: result.status },
      );
    }

    return Response.json(
      {
        success: true,
        duplicate: result.duplicate,
        count: {
          id: result.count.id,
          countedAmount: result.count.countedAmount,
          expectedAmount: result.count.expectedAmount,
          difference: result.count.difference,
          notes: result.count.notes,
          createdAt: result.count.createdAt,
        },
      },
      {
        status: result.duplicate ? 200 : 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2034", "P2002"].includes(error.code)
    ) {
      return Response.json(
        {
          error:
            "La operación requiere verificación. Reintenta con la misma referencia.",
        },
        { status: 409 },
      );
    }

    console.error("Failed to record cash count:", error);

    return Response.json(
      { error: "No se pudo confirmar el conteo de caja." },
      { status: 500 },
    );
  }
}
