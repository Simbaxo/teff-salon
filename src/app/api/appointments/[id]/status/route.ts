import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  // Only authenticated TEFF staff can change appointment statuses
  if (!session?.user) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Only OWNER and RECEPTIONIST can manage appointment statuses
  if (!canManageStaff(session.user.role)) {
    return Response.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }
  
  try {
    const { id } = await context.params;
    const body = await request.json();

    const appointmentId = Number(id);
    const { status } = body;

    if (!appointmentId || !status) {
      return Response.json(
        { error: "Missing appointment information" },
        { status: 400 }
      );
    }

    const allowedStatuses = [
      "BOOKED",
      "REQUESTED",
      "CHECKED_IN",
      "IN_PROGRESS",
      "COMPLETED",
      "CANCELLED",
      "NO_SHOW",
    ];

    if (!allowedStatuses.includes(status)) {
      return Response.json(
        { error: "Invalid appointment status" },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        status,
        ...(status === "CHECKED_IN"
          ? { checkedInAt: new Date() }
          : {}),
        ...(status === "IN_PROGRESS"
          ? { startedAt: new Date() }
          : {}),
      },
    });

    return Response.json(appointment);
  } catch (error) {
    console.error("Failed to update appointment status:", error);

    return Response.json(
      { error: "Unable to update appointment status" },
      { status: 500 }
    );
  }
}