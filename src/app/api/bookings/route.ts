import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  getTeffCurrentMinutes,
  getTeffDayOfWeek,
  getTeffToday,
} from "@/lib/datetime";

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

    // Validate the basic payload types before using the values
    // employeeId can be a technician ID or "any" for automatic assignment
    const hasInvalidPayloadTypes =
      (typeof employeeId !== "number" && employeeId !== "any") ||
      typeof date !== "string" ||
      typeof startTime !== "string" ||
      !Array.isArray(serviceIds) ||
      !Array.isArray(addonIds);

    if (hasInvalidPayloadTypes) {
      return Response.json(
        { error: "Invalid booking payload" },
        { status: 400 }
      );
    }

    // Customer text fields must be strings when provided
    const hasInvalidCustomerFieldTypes =
      typeof customerName !== "string" ||
      typeof customerPhone !== "string" ||
      (customerEmail !== undefined &&
        customerEmail !== null &&
        typeof customerEmail !== "string") ||
      (customerNotes !== undefined &&
        customerNotes !== null &&
        typeof customerNotes !== "string");

    if (hasInvalidCustomerFieldTypes) {
      return Response.json(
        { error: "Invalid customer information" },
        { status: 400 }
      );
    }

    // Keep public booking text fields within reasonable limits
    const hasInvalidCustomerFieldLength =
      customerName.length > 100 ||
      customerPhone.length > 30 ||
      (typeof customerEmail === "string" && customerEmail.length > 254) ||
      (typeof customerNotes === "string" && customerNotes.length > 1000);

    if (hasInvalidCustomerFieldLength) {
      return Response.json(
        { error: "Customer information is too long" },
        { status: 400 }
      );
    }

    // Normalize customer text fields before validation and saving
    const normalizedCustomerName =
      typeof customerName === "string" ? customerName.trim() : "";
    
    const normalizedCustomerPhone =
      typeof customerPhone === "string" 
        ? normalizePhoneNumber(customerPhone)
        : null;
    
    const normalizedCustomerEmail =
      typeof customerEmail === "string" ? customerEmail.trim() : "";

    const normalizedCustomerNotes =
      typeof customerNotes === "string" ? customerNotes.trim() : "";

    // Validate optional customer email
    const isValidEmail =
      normalizedCustomerEmail === "" ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedCustomerEmail);

    if (!isValidEmail) {
      return Response.json(
        { error: "Invalid customer email" },
        { status: 400 }
      );
    }

    // Phone normalization already validates the supported format
    if (!normalizedCustomerPhone) {
      return Response.json(
        { error: "Invalid customer phone" },
        { status: 400 }
      );
    }

    // Make sure the booking contains the required information
    if (
      !normalizedCustomerName ||
      !normalizedCustomerPhone ||
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

    // A specific technician must have a valid positive ID.
    // "any" is handled later by automatic technician assignment
    const hasInvalidEmployeeId = 
      employeeId !== "any" &&
      (!Number.isInteger(employeeId) || employeeId <= 0);

    // Validate that IDs are positive integers
    const hasInvalidIds =
      hasInvalidEmployeeId ||
      serviceIds.some(
        (id: unknown) => !Number.isInteger(id) || (id as number) <= 0
      ) ||
      addonIds.some(
        (id: unknown) => !Number.isInteger(id) || (id as number) <= 0
      );

      if (hasInvalidIds) {
        return Response.json(
          { error: "Invalid booking IDs" },
          { status: 400 }
        );
      }

    // Validate YYYY-MM-DD and reject impossible calendar dates
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

    let isValidDate = false;

    if (dateMatch) {
      const year = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const day = Number(dateMatch[3]);

      const parsedDate = new Date(Date.UTC(year, month - 1, day));

    isValidDate =
      parsedDate.getUTCFullYear() === year &&
      parsedDate.getUTCMonth() === month - 1 &&
      parsedDate.getUTCDate() === day;
    }

    // Validate the start time format: HH:MM using a 24-hour clock
    const isValidStartTime =
      /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);
      
    if (!isValidDate || !isValidStartTime) {
      return Response.json(
        { error: "Invalid booking date or time" },
        { status: 400 }
      );
    }

    // Get today's calendar date in TEFF's Medellín timezone
    const todayInMedellin = getTeffToday();

    // YYYY-MM-DD strings can be compared safely in chronological order
    if (date < todayInMedellin) {
      return Response.json(
        { error: "Booking date cannot be in the past" },
        { status: 400 }
      );
    }

    // Remove duplicate selections before validation
    const uniqueServiceIds = [...new Set<number>(serviceIds)];
    const uniqueAddonIds = [...new Set<number>(addonIds)];

    // Load the active services requested by the customer
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

    // Find every active technician who is qualified for all selected services.
    const activeEmployees = await prisma.employee.findMany({
      where: {
        active: true,
      },
      select: {
        id: true,
        employeeServices: {
          select: {
            serviceId: true,
          },
        },
      },
    });

    const qualifiedEmployees = activeEmployees.filter((employee) => {
      const qualifiedServiceIds = new Set(
        employee.employeeServices.map((relation) => relation.serviceId)
      );

      return uniqueServiceIds.every((serviceId) =>
        qualifiedServiceIds.has(serviceId)
      );
    });

    // A specific technician must exist and be qualified.
    // "any" keeps all qualified technicians as possible candidates.
    const candidateEmployeeIds =
      employeeId === "any"
        ? qualifiedEmployees.map((employee) => employee.id)
        : qualifiedEmployees.some((employee) => employee.id === employeeId)
          ? [employeeId]
          : [];

    if (candidateEmployeeIds.length === 0) {
      return Response.json(
        {
          error:
            employeeId === "any"
              ? "No technician is qualified for the selected services"
              : "Selected technician is not available for the selected services",
        },
        { status: 400 }
      );
    }

    // Load the active add-ons requested by the customer
    const addons = await prisma.addon.findMany({
      where: {
        id: {
          in: uniqueAddonIds,
        },
        active: true,
      },
    });

    // Make sure every requested add-on exists and is active
    if (addons.length !== uniqueAddonIds.length) {
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
    const hasInvalidAddon = uniqueAddonIds.some(
      (addonId: number) => !allowedAddonIds.has(addonId)
    );

    if (hasInvalidAddon) {
      return Response.json(
        {
          error:
            "One or more add-ons are not valid for the selected services",
        },
        { status: 400 }
      );
    }

    // Calculate how much time the complete appointment requires
    const totalDuration =
      services.reduce(
        (total, service) => total + service.estimatedDuration,
        0
      ) +
      addons.reduce(
        (total, addon) => total + addon.estimatedDuration,
        0
      );

    // TEFF business hours depend on the day of the week
    const dayOfWeek = getTeffDayOfWeek(date);

    const openingMinutes =
      dayOfWeek === 0
        ? 10 * 60 + 30 // Sunday: 10:30
        : 9 * 60 + 30; // Monday-Saturday 9:30
    
    const closingMinutes = 
      dayOfWeek === 0
      ? 17 * 60 + 30 // Sunday: 17:30
      : 18 * 60 + 30; // Monday-Saturday: 18:30
      
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const bookingStartMinutes = startHour * 60 + startMinute;
    const bookingEndMinutes = bookingStartMinutes + totalDuration;

    // Prevent bookings for a time that has already passed today in Medellin.
    if (
      date === getTeffToday() &&
      bookingStartMinutes <= getTeffCurrentMinutes()
    ) {
      return Response.json(
        { error: "Booking time cannot be in the past" },
        { status: 400 }
      );
    }

    if (
      bookingStartMinutes < openingMinutes ||
      bookingEndMinutes > closingMinutes
    ) {
      return Response.json(
        { error: "Appointment is outside business hours" },
        { status: 400 }
      );
    }

    // Approval-required services are requests until the salon confirms them
    const requiresApproval = services.some(
      (service) => service.requiresApproval
    );

    const status = requiresApproval ? "REQUESTED" : "BOOKED";

    // Retry serializable transactions if two booking race at the same time
    const maxAttempts = 3;

    let result = null;

    for (let attempt =1; attempt <= maxAttempts; attempt++) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            // Load schedule-blocking appointments for every possible technician
            // For a specific technician this contains one ID; "any" may contain several
            const existingAppointments = await tx.appointment.findMany({
              where: {
                employeeId: {
                  in: candidateEmployeeIds,
                },
                date: new Date(`${date}T00:00:00.000Z`),
                status: {
                  // These appointments still occupy the technician's schedule
                  in: ["BOOKED", "REQUESTED", "CHECKED_IN", "IN_PROGRESS"],
                },
              },
            });

            // Convert a time such at "10:30" into minutes
            function timeToMinutes(time: string) {
              const [hours, minutes] = time.split(":").map(Number);

              return hours * 60 + minutes;
            }

            const requestedStart = timeToMinutes(startTime);
            const requestedEnd = requestedStart + totalDuration;

            // Keep only technicians who are free for the entire requested appointment
            const availableEmployeeIds = candidateEmployeeIds.filter(
              (candidateEmployeeId) => {
                // Check whether this appointment overlaps an existing appointment
                const hasConflict = existingAppointments.some((appointment) => {
                  if (appointment.employeeId !== candidateEmployeeId) {
                    return false;
                  }

                  const existingStart = timeToMinutes(appointment.startTime);
                  const existingEnd = existingStart + appointment.duration;
                  
                  return (
                    requestedStart < existingEnd &&
                    requestedEnd > existingStart
                  );
                });

                return !hasConflict;
              }
            )

            // The requested time is unavailable only when every candidate is busy
            if (availableEmployeeIds.length === 0) {
              throw new Error("BOOKING_CONFLICT");
            }

            // Balance "Any Technician" bookings by scheduled workload for the day
            // A specifically selected technician always keeps the customer's choice
            const assignedEmployeeId =
              employeeId === "any"
                ? availableEmployeeIds.reduce((bestEmployeeId, currentEmployeeId) => {
                  const scheduledMinutes = (candidateId: number) =>
                    existingAppointments
                      .filter((appointment) => appointment.employeeId === candidateId)
                      .reduce(
                        (total, appointment) => total + appointment.duration,
                        0
                      );
                      
                        const bestMinutes = scheduledMinutes(bestEmployeeId);
                        const currentMinutes = scheduledMinutes(currentEmployeeId);

                        if (currentMinutes < bestMinutes) {
                          return currentEmployeeId;
                        }

                        if (
                          currentMinutes === bestMinutes &&
                          currentEmployeeId < bestEmployeeId
                        ) {
                          return currentEmployeeId;
                        }

                        return bestEmployeeId;
                })
                : availableEmployeeIds[0]

            // Reuse an existing customer when the phone number already exists
            const customer = await tx.customer.upsert({
              where: {
                phone: normalizedCustomerPhone,
              },

              update: {
                // Keep customer details current when they book again
                name: normalizedCustomerName,
                email: normalizedCustomerEmail || null,
              },

              create: {
                name: normalizedCustomerName,
                phone: normalizedCustomerPhone,
                email: normalizedCustomerEmail || null,
              },
            });

            // Create the appointment and permanent booking snapshots
            const appointment = await tx.appointment.create({
              data: {
                customerId: customer.id,
                employeeId: assignedEmployeeId,
                date: new Date(`${date}T00:00:00.000Z`),
                startTime,
                duration: totalDuration,
                status,
                notes: normalizedCustomerNotes || null,

                appointmentServices: {
                  create: services.map((service) => ({
                    serviceId: service.id,
                bookedPrice: service.price,
                bookedDuration: service.estimatedDuration,
                  }))
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
          },
          {
            // PostgreSQL prevents concurrent transactions from silently conflicting
            isolationLevel: "Serializable",
          }
        );

      // Transaction succeeded, so no retry is needed
      break;
    } catch (error) {
      // A normal occupied-slot conflict should not be retired
      if (
        error instanceof Error &&
        error.message === "BOOKING_CONFLICT"
      ) {
        throw error;
      }

      // Prisma uses P2034 for transaction write/serialization conflicts
      const isSerializableConflict =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034"

        if (!isSerializableConflict) {
          throw error;
        }

        // If all retry attempts were used, treat the slot as unavailable
        if (attempt === maxAttempts) {
          throw new Error("BOOKING_CONFLICT");
        }

        // Otherwise retry the entire availability check + booking transaction
      }
    }

    if (!result) {
      throw new Error("Unable to complete booking transaction")
    }

    return Response.json(result, { status: 201 });

  } catch (error) {
    // Return the normal booking conflict response to the customer
    if (
      error instanceof Error &&
      error.message === "BOOKING_CONFLICT"
    ) {
      return Response.json(
        { error: "This appointment time is no longer available" },
        { status: 409 }
      );
    }

    console.error("Booking creation failed:", error);

    return Response.json(
      { error: "Unable to create booking" },
      { status: 500 }
    );
  }
}