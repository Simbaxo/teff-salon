import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageStaff } from "@/lib/auth-roles";
import { isLoanTestEnabled } from "@/lib/cashbox/is-loan-test-enabled";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "No has iniciado sesión." }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json(
      { error: "No tienes permiso para consultar las técnicas." },
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

    const technicians = await prisma.employee.findMany({
      where: {
        active: true,
        compensationType: "COMMISSION",
        NOT: [
          {
            name: {
              startsWith: "teff-checkout-",
            },
          },
          {
            name: {
              startsWith: "teff-cashbox-",
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    // Expose only the approved fixture in isolated Development test mode.
    // Never expose test fixtures to RECEPTIONIST accounts.
    if (user.role === "OWNER" && isLoanTestEnabled()) {
      const fixtureId = Number(process.env.TEFF_CASHBOX_LOAN_TEST_EMPLOYEE_ID);

      const fixtureMarker = process.env.TEFF_CASHBOX_LOAN_TEST_MARKER;

      if (
        Number.isSafeInteger(fixtureId) &&
        fixtureId > 0 &&
        typeof fixtureMarker === "string" &&
        /^teff-cashbox-[0-9a-f-]{36}$/.test(fixtureMarker)
      ) {
        const fixture = await prisma.employee.findUnique({
          where: { id: fixtureId },
          select: {
            id: true,
            name: true,
            active: true,
            compensationType: true,
          },
        });

        if (
          fixture?.active === true &&
          fixture.compensationType === "COMMISSION" &&
          fixture.name === `${fixtureMarker}-Technician`
        ) {
          technicians.push({
            id: fixture.id,
            name: fixture.name,
          });
        }
      }
    }

    return Response.json(
      { technicians },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    console.error("Failed to load cashbox technicians:", error);

    return Response.json(
      { error: "No se pudo consultar la lista de técnicas." },
      { status: 500 },
    );
  }
}
