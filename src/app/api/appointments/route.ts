import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        status: {
          in: ["BOOKED", "REQUESTED"],
        },
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        startTime: true,
        duration: true,
        status: true,
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