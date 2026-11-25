import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { queueGoogleCalendarSync } from "@/lib/google-calendar/queue";
import { triggerGoogleCalendarSync } from "@/lib/google-calendar/trigger-sync";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    groupId: string;
  }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { groupId } = await context.params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      groupId,
    )
  ) {
    return Response.json(
      { error: "Identificador de vacaciones inválido." },
      { status: 400 },
    );
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const initialBlocks = await tx.employeeScheduleBlock.findMany({
            where: { groupId },
            select: {
              id: true,
              employeeId: true,
            },
          });

          if (initialBlocks.length === 0) {
            return { type: "NOT_FOUND" as const };
          }

          const employeeIds = [
            ...new Set(initialBlocks.map((block) => block.employeeId)),
          ];

          // A vacation group must belong to one technician.
          if (employeeIds.length !== 1) {
            return { type: "INVALID_GROUP" as const };
          }

          const employeeId = employeeIds[0];

          // Coordinate with appointment and schedule changes.
          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              73421,
              ${employeeId}
            )::text
          `;

          // Refresh the group after acquiring the lock.
          const blocks = await tx.employeeScheduleBlock.findMany({
            where: {
              groupId,
              employeeId,
            },
            select: { id: true },
          });

          if (blocks.length === 0) {
            return { type: "NOT_FOUND" as const };
          }

          const deletion = await tx.employeeScheduleBlock.deleteMany({
            where: {
              groupId,
              employeeId,
            },
          });

          if (deletion.count !== blocks.length) {
            throw new Error("SCHEDULE_BLOCK_GROUP_CHANGED");
          }

          // Keep Google Calendar's existing deletion sync.
          if (process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true") {
            for (const block of blocks) {
              await queueGoogleCalendarSync(tx, "SCHEDULE_BLOCK", block.id);
            }
          }

          return {
            type: "DELETED" as const,
            groupId,
            employeeId,
            deletedCount: deletion.count,
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
          { error: "No se encontraron estas vacaciones." },
          { status: 404 },
        );
      }

      if (result.type === "INVALID_GROUP") {
        return Response.json(
          {
            error: "El grupo contiene bloqueos de distintas técnicas.",
          },
          { status: 409 },
        );
      }

      // Trigger Google Calendar synchronization only after
      // the schedule block group deletion transaction has committed.
      if (process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true") {
        triggerGoogleCalendarSync();
      }

      return Response.json({
        success: true,
        groupId: result.groupId,
        employeeId: result.employeeId,
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }

      console.error("Failed to delete vacation group:", error);

      return Response.json(
        {
          error: "No se pudieron eliminar las vacaciones. Intenta nuevamente.",
        },
        { status: 500 },
      );
    }
  }

  return Response.json(
    { error: "No se pudo completar la solicitud." },
    { status: 500 },
  );
}
