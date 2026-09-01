import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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