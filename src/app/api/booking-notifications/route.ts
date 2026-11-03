import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store",
};

async function getAuthenticatedStaffId() {
  const session = await auth();

  if (!session?.user) {
    return { error: "Unauthorized", status: 401 } as const;
  }

  if (!canManageStaff(session.user.role)) {
    return { error: "Forbidden", status: 403 } as const;
  }

  const userId = Number(session.user.id);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return {
      error: "Invalid authenticated user",
      status: 401,
    } as const;
  }

  return { userId } as const;
}

// Retrieve online bookings and the current user's unread count.
export async function GET(request: Request) {
  const staff = await getAuthenticatedStaffId();

  if ("error" in staff) {
    return Response.json(
      { error: staff.error },
      { status: staff.status, headers: privateHeaders },
    );
  }

  try {
    const userId = staff.userId;

    // Cursor pagination: use the previous page's final booking ID.
    const cursorParam = new URL(request.url).searchParams.get("cursor");

    let cursor: {
      id: number;
      createdAt: Date;
    } | null = null;

    if (cursorParam !== null) {
      const cursorId = Number(cursorParam);

      if (!/^[1-9]\d*$/.test(cursorParam) || !Number.isSafeInteger(cursorId)) {
        return Response.json(
          { error: "Invalid pagination cursor" },
          { status: 400, headers: privateHeaders },
        );
      }

      const cursorBooking = await prisma.booking.findUnique({
        where: { id: cursorId },
        select: {
          createdAt: true,
          source: true,
        },
      });

      if (!cursorBooking || cursorBooking.source !== "WEB") {
        return Response.json(
          { error: "Invalid pagination cursor" },
          { status: 400, headers: privateHeaders },
        );
      }

      cursor = {
        id: cursorId,
        createdAt: cursorBooking.createdAt,
      };
    }

    const [unreadCount, bookings] = await Promise.all([
      prisma.booking.count({
        where: {
          source: "WEB",
          readReceipts: {
            none: { userId },
          },
        },
      }),

      prisma.booking.findMany({
        where: {
          source: "WEB",
          readReceipts: {
            none: { userId },
          },

          ...(cursor
            ? {
                OR: [
                  {
                    createdAt: {
                      lt: cursor.createdAt,
                    },
                  },
                  {
                    createdAt: cursor.createdAt,
                    id: {
                      lt: cursor.id,
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 11,
        select: {
          id: true,
          date: true,
          createdAt: true,

          customer: {
            select: {
              name: true,
            },
          },

          appointments: {
            orderBy: {
              startTime: "asc",
            },
            select: {
              id: true,
              startTime: true,
              status: true,
              appointmentServices: {
                select: {
                  service: {
                    select: {
                      nameEs: true,
                    },
                  },
                },
              },
            },
          },

          readReceipts: {
            where: { userId },
            select: {
              readAt: true,
            },
          },
        },
      }),
    ]);
    const pageBookings = bookings.slice(0, 10);

    const nextCursor =
      bookings.length > 10
        ? String(pageBookings[pageBookings.length - 1].id)
        : null;

    const notifications = pageBookings.map((booking) => ({
      bookingId: booking.id,
      customerName: booking.customer.name,
      date: booking.date.toISOString().slice(0, 10),
      createdAt: booking.createdAt.toISOString(),

      startTime: booking.appointments[0]?.startTime ?? null,

      serviceNames: [
        ...new Set(
          booking.appointments.flatMap((appointment) =>
            appointment.appointmentServices.map((item) => item.service.nameEs),
          ),
        ),
      ],

      isRead: booking.readReceipts.length > 0,

      readAt: booking.readReceipts[0]?.readAt.toISOString() ?? null,
    }));

    return Response.json(
      {
        unreadCount,
        notifications,
        nextCursor,
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Failed to load booking notifications:", error);

    return Response.json(
      { error: "Unable to load notifications" },
      { status: 500, headers: privateHeaders },
    );
  }
}

// Mark one online booking as read for the authenticated user.
export async function POST(request: Request) {
  const staff = await getAuthenticatedStaffId();

  if ("error" in staff) {
    return Response.json(
      { error: staff.error },
      { status: staff.status, headers: privateHeaders },
    );
  }

  const body = await request.json().catch(() => null);
  const bookingId = body?.bookingId;

  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    return Response.json(
      { error: "Invalid booking ID" },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    // Internal and legacy bookings cannot generate read receipts.
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        source: "WEB",
      },
      select: {
        id: true,
      },
    });

    if (!booking) {
      return Response.json(
        { error: "Booking not found" },
        { status: 404, headers: privateHeaders },
      );
    }

    // The compound primary key prevents duplicate receipts.
    // Existing read timestamps are preserved.
    const receipt = await prisma.bookingReadReceipt.upsert({
      where: {
        bookingId_userId: {
          bookingId,
          userId: staff.userId,
        },
      },
      update: {},
      create: {
        bookingId,
        userId: staff.userId,
      },
      select: {
        bookingId: true,
        readAt: true,
      },
    });

    return Response.json(
      {
        success: true,
        bookingId: receipt.bookingId,
        readAt: receipt.readAt.toISOString(),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Failed to mark booking as read:", error);

    return Response.json(
      { error: "Unable to update notification" },
      { status: 500, headers: privateHeaders },
    );
  }
}

export async function PATCH(request: Request) {
  const staff = await getAuthenticatedStaffId();

  if ("error" in staff) {
    return Response.json(
      { error: staff.error },
      { status: staff.status, headers: privateHeaders },
    );
  }

  const body: unknown = await request.json().catch(() => null);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "Solicitud inválida." },
      { status: 400, headers: privateHeaders },
    );
  }

  const input = body as Record<string, unknown>;
  const { bookingId, clearAll } = input;

  if (
    clearAll !== true &&
    (!Number.isSafeInteger(bookingId) ||
      typeof bookingId !== "number" ||
      bookingId <= 0)
  ) {
    return Response.json(
      { error: "Reserva inválida." },
      { status: 400, headers: privateHeaders },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: staff.userId },
      select: { active: true, role: true },
    });

    if (!user?.active || !canManageStaff(user.role)) {
      return Response.json(
        { error: "Usuario no autorizado." },
        { status: 403, headers: privateHeaders },
      );
    }

    if (clearAll === true) {
      const unread = await prisma.booking.findMany({
        where: {
          source: "WEB",
          readReceipts: {
            none: { userId: staff.userId },
          },
        },
        select: { id: true },
      });

      if (unread.length > 0) {
        await prisma.bookingReadReceipt.createMany({
          data: unread.map((booking) => ({
            bookingId: booking.id,
            userId: staff.userId,
          })),
          skipDuplicates: true,
        });
      }

      return Response.json(
        { success: true, cleared: unread.length },
        { headers: privateHeaders },
      );
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId as number,
        source: "WEB",
      },
      select: { id: true },
    });

    if (!booking) {
      return Response.json(
        { error: "La reserva ya no existe." },
        { status: 404, headers: privateHeaders },
      );
    }

    await prisma.bookingReadReceipt.upsert({
      where: {
        bookingId_userId: {
          bookingId: booking.id,
          userId: staff.userId,
        },
      },
      update: {},
      create: {
        bookingId: booking.id,
        userId: staff.userId,
      },
    });

    return Response.json(
      { success: true, cleared: 1 },
      { headers: privateHeaders },
    );
  } catch (error) {
    console.error("Failed to dismiss booking notifications:", error);

    return Response.json(
      { error: "No se pudieron limpiar las notificaciones." },
      { status: 500, headers: privateHeaders },
    );
  }
}
