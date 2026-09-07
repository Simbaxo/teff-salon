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
      !Array.isArray(serviceIds) ||
      serviceIds.length === 0 ||
      !Array.isArray(addonIds)
    ) {
      return Response.json(
        { error: "Missing required booking information" },
        { status: 400 }
      );
    }

    // Remove duplicate selections before validation
    const uniqueServiceIds = [...new Set<number>(serviceIds)];
    const uniqueAddonIds = [...new Set<number>(addonIds ?? [])];

    const services = await prisma.service.findMany({
      where: {
        id: {
          in: uniqueServiceIds,
        },
        active: true,
      },
    });

    // Make sure every requested service exists and is active
    if (services.length !== uniqueServiceIds.length) {
      return Response.json(
        { error: "One or more services are invalid" },
        { status: 400 }
      );
    }

    // Load the services this technician is qualified to perform
    const employeeServices = await prisma.employeeService.findMany({
      where: {
        employeeId,
      },
    });

    const employeeServiceIds = new Set(
      employeeServices.map((item) => item.serviceId)
    );

    // The selected technician must be qualified for every requested service
    const hasUnsupportedService = uniqueServiceIds.some(
      (serviceId: number) => !employeeServiceIds.has(serviceId)
    );

    if (hasUnsupportedService) {
      return Response.json(
        { error: " Technician is not qualified for one or more services" },
        { status: 400 }
      );
    }

    const addons = await prisma.addon.findMany({
      where: {
        id: {
          in: uniqueAddonIds ?? [],
        },
        active: true,
      },
    });

    // Make sure ever requested add-on exists and is active
    if (addons.length !== (uniqueAddonIds ?? []).length) {
      return Response.json(
        { error: "One or more add-ons are invalid" },
        { status: 400 }
      );
    }

    // Load the valid add-on relationships for the selected services
    const serviceAddonRelations = await prisma.serviceAddon.findMany({
      where: {
        serviceId: {
          in: uniqueServiceIds,
        },
      },
    });

    const allowedAddonIds = new Set(
      serviceAddonRelations.map((relation) => relation.addonId)
    );

    // Every selected add-on must belong to at least one selected service
    const hasInvalidAddon = (uniqueAddonIds ?? []).some(
      (addonId: number) => !allowedAddonIds.has(addonId)
    );

    if (hasInvalidAddon) {
      return Response.json(
        { error: "One or more add-ons are not valid for the selected services" },
        { status: 400}
      );
    }

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
            // These appointments still occupy the technician's schedule
            in: ["BOOKED", "REQUESTED", "CHECKED_IN", "IN_PROGRESS"],
          },
        },
      });

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