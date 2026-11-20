import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const bookingId = Number(id);

  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    return Response.json(
      { error: "Identificador de reserva inválido." },
      { status: 400 },
    );
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Coordinate concurrent check-in requests for this booking.
          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              73423,
              ${bookingId}
            )::text
          `;

          const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            select: {
              id: true,
              appointments: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
          });

          if (!booking || booking.appointments.length === 0) {
            return { type: "NOT_FOUND" as const };
          }

          // Only BOOKED services may transition to CHECKED_IN.
          const eligibleIds = booking.appointments
            .filter((appointment) => appointment.status === "BOOKED")
            .map((appointment) => appointment.id);

          if (eligibleIds.length === 0) {
            const alreadyCheckedIn = booking.appointments.every(
              (appointment) => appointment.status === "CHECKED_IN",
            );

            return {
              type: alreadyCheckedIn
                ? ("ALREADY_CHECKED_IN" as const)
                : ("NO_ELIGIBLE_SERVICES" as const),
              appointmentIds: booking.appointments.map(
                (appointment) => appointment.id,
              ),
            };
          }

          const updated = await tx.appointment.updateMany({
            where: {
              id: { in: eligibleIds },
              bookingId,
              status: "BOOKED",
            },
            data: {
              status: "CHECKED_IN",
              checkedInAt: new Date(),
            },
          });

          if (updated.count !== eligibleIds.length) {
            throw new Error("BOOKING_CHECK_IN_CHANGED");
          }

          return {
            type: "CHECKED_IN" as const,
            updatedCount: updated.count,
            appointmentIds: eligibleIds,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

      if (result.type === "NOT_FOUND") {
        return Response.json(
          { error: "Reserva no encontrada." },
          { status: 404 },
        );
      }

      if (result.type === "NO_ELIGIBLE_SERVICES") {
        return Response.json(
          {
            error: "Esta reserva no tiene servicios pendientes de llegada.",
          },
          { status: 409 },
        );
      }

      if (result.type === "ALREADY_CHECKED_IN") {
        return Response.json({
          success: true,
          alreadyCheckedIn: true,
          bookingId,
          appointmentIds: result.appointmentIds,
          updatedCount: 0,
        });
      }

      return Response.json({
        success: true,
        alreadyCheckedIn: false,
        bookingId,
        appointmentIds: result.appointmentIds,
        updatedCount: result.updatedCount,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }

      if (
        error instanceof Error &&
        error.message === "BOOKING_CHECK_IN_CHANGED"
      ) {
        return Response.json(
          {
            error:
              "La reserva cambió durante el registro de llegada. Actualiza e intenta nuevamente.",
          },
          { status: 409 },
        );
      }

      console.error("Booking check-in failed:", error);

      return Response.json(
        {
          error: "No se pudo registrar la llegada del cliente.",
        },
        { status: 500 },
      );
    }
  }

  return Response.json(
    { error: "No se pudo completar el registro de llegada." },
    { status: 500 },
  );
}
