import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { queueGoogleCalendarSync } from "@/lib/google-calendar/queue";

type RouteContext = {
  params: Promise<{
    id: string;
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

  const { id } = await context.params;
  const blockId = Number(id);

  if (!Number.isInteger(blockId) || blockId <= 0) {
    return Response.json(
      { error: "Invalid schedule block ID" },
      { status: 400 },
    );
  }

  try {
    const existing = await prisma.employeeScheduleBlock.findUnique({
      where: {
        id: blockId,
      },
    });

    if (!existing) {
      return Response.json(
        { error: "Schedule block not found" },
        { status: 404 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.employeeScheduleBlock.delete({
        where: { id: blockId },
      });

      if (process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true") {
        await queueGoogleCalendarSync(tx, "SCHEDULE_BLOCK", blockId);
      }
    });

    return Response.json({
      success: true,
    });
  } catch (error) {
    console.error("Failed to delete schedule block:", error);

    return Response.json(
      { error: "Unable to delete schedule block" },
      { status: 500 },
    );
  }
}
