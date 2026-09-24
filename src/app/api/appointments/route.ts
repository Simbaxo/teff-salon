import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    // Public booking availability only needs scheduling data
    if (mode === "availability") {
      const appointments = await prisma.appointment.findMany({
        where: {
          status: {
            in: ["BOOKED", "REQUESTED", "CHECKED_IN", "IN_PROGRESS"],
          },
        },

        select: {
          id: true,
          bookingId: true,
          employeeId: true,
          date: true,
          startTime: true,
          duration: true,
          status: true,
          notes: true,
        },

        orderBy: {
          date: "asc"
        },
      });

      return Response.json(appointments)
    }

    // Detailed appointment data is only available to TEFF staff
    const session = await auth();

    if (!session?.user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!canManageStaff(session.user.role)) {
      return Response.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Staff appointment data
    const appointments = await prisma.appointment.findMany({
      where: {
        status: {
          in: [
            "BOOKED",
            "REQUESTED",
            "CHECKED_IN",
            "IN_PROGRESS",
            "COMPLETED",
          ],
        },
      },

      select: {
        createdAt: true,
        id: true,
        bookingId: true,
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
                nameEn: true,
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