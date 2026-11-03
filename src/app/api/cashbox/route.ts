import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageStaff } from "@/lib/auth-roles";
import { calculateCashboxBalance } from "@/lib/cashbox/balance";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // OWNER and RECEPTIONIST can view the cashbox.
  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const cashbox = await tx.cashbox.findUnique({
          where: { id: 1 },
          select: {
            id: true,
            openingBalance: true,
            openedAt: true,
          },
        });

        // Do not assume an empty cashbox has a zero balance.
        // Physical cash must be counted before activation.
        if (!cashbox) {
          return {
            initialized: false as const,
          };
        }

        return {
          initialized: true as const,
          ...(await calculateCashboxBalance(tx, cashbox)),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      },
    );

    return Response.json({
      ...result,
      readOnly: true,
    });
  } catch (error) {
    console.error("Failed to load cashbox balance:", error);

    return Response.json(
      {
        error: "No se pudo consultar la caja de efectivo.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Initial activation is OWNER-only.
  if (session.user.role !== "OWNER") {
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

  if (!body || typeof body !== "object" || !("openingBalance" in body)) {
    return Response.json({ error: "Falta el saldo inicial." }, { status: 400 });
  }

  const { openingBalance } = body;

  if (
    typeof openingBalance !== "number" ||
    !Number.isSafeInteger(openingBalance) ||
    openingBalance < 0 ||
    openingBalance > 2147483647
  ) {
    return Response.json({ error: "Saldo inicial inválido." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: {
            active: true,
            role: true,
          },
        });

        if (!user?.active || user.role !== "OWNER") {
          return {
            error: "Usuario no autorizado.",
            httpStatus: 403,
          };
        }

        const existing = await tx.cashbox.findUnique({
          where: { id: 1 },
          select: { id: true },
        });

        if (existing) {
          return {
            error: "La caja ya fue activada.",
            httpStatus: 409,
          };
        }

        const cashbox = await tx.cashbox.create({
          data: {
            id: 1,
            openingBalance,
            openedAt: new Date(),
            openedById: userId,
          },
          select: {
            id: true,
            openingBalance: true,
            openedAt: true,
          },
        });

        return {
          success: true,
          cashbox,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      },
    );

    if ("error" in result) {
      return Response.json(
        { error: result.error },
        { status: result.httpStatus ?? 409 },
      );
    }

    return Response.json(result, {
      status: 201,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return Response.json(
        { error: "La caja ya fue activada." },
        { status: 409 },
      );
    }

    console.error("Cashbox activation failed:", error);

    return Response.json(
      { error: "No se pudo activar la caja." },
      { status: 500 },
    );
  }
}
