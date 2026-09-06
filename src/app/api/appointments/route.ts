import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    // Only active appointment statuses should block customer availability
    const statuses =
      mode === "availability"
        ? ["BOOKED", "REQUESTED", "CHECKED_IN", "IN_PROGRESS"]
        : ["BOOKED", "REQUESTED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"];

    const appointments = await prisma.appointment.findMany({
      where: {
        status: {
          in: statuses,
        },
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        startTime: true,
        duration: true,
        status: true,
        notes: true,

        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },

        employee: {
          select: {
            id: true,
            name: true,
          },
        },

        appointmentServices: {
          select: {
            bookedPrice: true,
            bookedDuration: true,
            service: {
              select: {
                id: true,
                nameEs: true,
                nameEn: true
              },
            },
          },
        },

        appointmentAddons: {
          select: {
            bookedPrice: true,
            bookedDuration: true,
            addon: {
              select: {
                id: true,
                nameEs: true,
                nameEn: true,
              },
            },
          },
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    return Response.json(appointments);
  } catch (error) {
    console.error("Failed to load appointments:", error);

    return Response.json(
      { error: "Unable to load appointments" },
      { status: 500 }
    );
  }
}