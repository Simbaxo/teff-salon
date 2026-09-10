import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { hasTeffAppointmentStarted } from "@/lib/datetime";

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

    const existingAppointment = await prisma.appointment.findUnique({
      where: {
        id: appointmentId,
      },
      select: {
        status: true,
        date: true,
        startTime: true,
      },
    });

    if (!existingAppointment) {
      return Response.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }

    const allowedTransitions: Record<string, string[]> = {
      REQUESTED: ["BOOKED", "CANCELLED"],
      BOOKED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
      CHECKED_IN: ["IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["COMPLETED"],
      COMPLETED: [],
      CANCELLED: [],
      NO_SHOW: [],
    }

    const validNextStatuses =
      allowedTransitions[existingAppointment.status] ?? [];

    if (!validNextStatuses.includes(status)) {
      return Response.json(
        {
          error: `Cannot change appointment from ${existingAppointment.status} to ${status}`
        },
        { status: 400 }
      );
    }

    // A client can only be marked as a no-show after their scheduled
    // appointment time has actually started in Medellin
    if (
      status === "NO_SHOW" &&
      !hasTeffAppointmentStarted(
        existingAppointment.date.toISOString().slice(0, 10),
        existingAppointment.startTime
      )
    ) {
      return Response.json(
        { error: "Cannot mark appointment as a no-show before its start time" },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.update({
      where: {
        id: appointmentId,
      },
      data: {
        status,

        // Record the real moment the client checked in
        ...(status === "CHECKED_IN"
          ? { checkedInAt: new Date() }
          : {}),

          // Record when the service actually started
        ...(status === "IN_PROGRESS"
          ? { startedAt: new Date() }
          : {}),

        // Keep completion timestamps consistent if this route completes an appointment
        ...(status === "COMPLETED"
          ? { completedAt: new Date() }
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