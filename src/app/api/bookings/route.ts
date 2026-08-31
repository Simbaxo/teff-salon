import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      customerName,
      customerPhone,
      customerEmail,
      customerNotes,
      employeeId,
      date,
      startTime,
      serviceIds,
      addonIds,
    } = body;

    if (
      !customerName ||
      !customerPhone ||
      !employeeId ||
      !date ||
      !startTime ||
      !serviceIds?.length
    ) {
      return Response.json(
        { error: "Missing required booking information" },
        { status: 400 }
      );
    }

    const services = await prisma.service.findMany({
      where: {
        id: {
          in: serviceIds,
        },
        active: true,
      },
    });

    const addons = await prisma.addon.findMany({
      where: {
        id: {
          in: addonIds ?? [],
        },
        active: true,
      },
    });

    const totalDuration =
      services.reduce(
        (total, service) => total + service.estimatedDuration,
        0
      ) +
      addons.reduce(
        (total, addon) => total + addon.estimatedDuration,
        0
      );

      // Prevent double bookings on server
      const existingAppointments = await prisma.appointment.findMany({
        where: {
          employeeId,
          date: new Date(`${date}T00:00:00.000Z`),
          status: {
            in: ["BOOKED", "REQUESTED"]
          },
        },
      });

      console.log("NEW BOOKING:", {
        employeeId,
        date,
        startTime,
        totalDuration,
      });

      console.log("EXISTING APPOINTMENTS:", existingAppointments)

      // Convert requested time to minutes
      function timeToMinutes(time: string) {
        const [hours, minutes] = time.split(":").map(Number);
        return hours * 60 + minutes;
      }
      
      const requestedStart = timeToMinutes(startTime);
      const requestedEnd = requestedStart + totalDuration;

      // Check for overlap
      const hasConflict = existingAppointments.some((appointment) => {
        const existingStart = timeToMinutes(appointment.startTime);
        const existingEnd = existingStart + appointment.duration;

        return (
          requestedStart < existingEnd &&
          requestedEnd > existingStart
        );
      });

      if (hasConflict) {
        return Response.json(
          {
            error: "This appointment time is no longer available",
          },
          { status: 409 }
        );
      }

    const requiresApproval = services.some(
      (service) => service.requiresApproval
    );

    const status = requiresApproval ? "REQUESTED" : "BOOKED";

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: customerName,
          phone: customerPhone,
          email: customerEmail || null,
        },
      });

      const appointment = await tx.appointment.create({
        data: {
          customerId: customer.id,
          employeeId,
          date: new Date(`${date}T00:00:00.000Z`),
          startTime,
          duration: totalDuration,
          status,
          notes: customerNotes || null,

          appointmentServices: {
            create: services.map((service) => ({
              serviceId: service.id,
              bookedPrice: service.price,
              bookedDuration: service.estimatedDuration,
            })),
          },

          appointmentAddons: {
            create: addons.map((addon) => ({
              addonId: addon.id,
              bookedPrice: addon.price,
              bookedDuration: addon.estimatedDuration,
            })),
          },
        },
        include: {
          customer: true,
          employee: true,
          appointmentServices: true,
          appointmentAddons: true,
        },
      });

      return appointment;
    });

    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("Booking creation failed:", error);

    return Response.json(
      { error: "Unable to create booking" },
      { status: 500 }
    );
  }
}