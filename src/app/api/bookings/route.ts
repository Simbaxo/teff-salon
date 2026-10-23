import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/push";
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
      serviceAssignments,
      date,
      startTime,
      serviceIds,
      addonAssignments,
    } = body;

    type ServiceAssignmentInput = {
      serviceId: number;
      employeeId: number | "any";
    };

    type AddonAssignmentInput = {
      addonId: number;
      serviceId: number;
    };

    // Validate the basic payload types before using the values
    // employeeId can be a technician ID or "any" for automatic assignment
    const hasInvalidPayloadTypes =
      !Array.isArray(serviceAssignments) ||
      typeof date !== "string" ||
      typeof startTime !== "string" ||
      !Array.isArray(serviceIds) ||
      !Array.isArray(addonAssignments);

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
      typeof customerPhone === "string" && customerPhone.trim() !== ""
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

    // Make sure the booking contains the required information
    if (
      !normalizedCustomerName ||
      !date ||
      !startTime ||
      !Array.isArray(serviceIds) ||
      serviceIds.length === 0 ||
      !Array.isArray(serviceAssignments) ||
      serviceAssignments.length === 0 ||
      !Array.isArray(addonAssignments)
    ) {
      return Response.json(
        { error: "Missing required booking information" },
        { status: 400 }
      );
    }

    // Validate each service-to-technician assignment
    // A technician can be a specific employee ID or "any"
    const hasInvalidServiceAssignments = serviceAssignments.some(
      (assignment: ServiceAssignmentInput) =>
        !assignment ||
        !Number.isInteger(assignment.serviceId) ||
        assignment.serviceId <= 0 ||
        (assignment.employeeId !== "any" &&
          (!Number.isInteger(assignment.employeeId) ||
            assignment.employeeId <= 0))
    );

    // Validate each add-on-to-service assignment.
    const hasInvalidAddonAssignments = addonAssignments.some(
      (assignment: AddonAssignmentInput) =>
        !assignment ||
        !Number.isInteger(assignment.addonId) ||
        assignment.addonId <= 0 ||
        !Number.isInteger(assignment.serviceId) ||
        assignment.serviceId <= 0
    );

    // Validate that service and add-on IDs are positive integers
    const hasInvalidIds =
      hasInvalidServiceAssignments ||
      hasInvalidAddonAssignments ||
      serviceIds.some(
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
    const uniqueAddonIds = [
      ...new Set<number>(
        addonAssignments.map(
          (assignment: AddonAssignmentInput) => assignment.addonId
        )
      ),
    ];

    // Every selected service must have exacty one technician assignment
    const assignedServiceIds = serviceAssignments.map(
      (assignment: ServiceAssignmentInput) => assignment.serviceId
    );

    const uniqueAssignedServiceIds = [...new Set<number>(assignedServiceIds)];

    const assignmentsMatchServices =
      uniqueAssignedServiceIds.length === uniqueServiceIds.length &&
      uniqueServiceIds.every((serviceId) =>
      uniqueAssignedServiceIds.includes(serviceId)
    ) &&
    assignedServiceIds.length === uniqueServiceIds.length;

  if (!assignmentsMatchServices) {
    return Response.json(
      { error: "Service assignments do not match selected services" },
      { status: 400 }
    );
  }

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

    //  Load active technicians and the services they are qualified to perform
    const activeEmployees = await prisma.employee.findMany({
      where: {
        active: true,
        isBookable: true,
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

    // Build the qualified technician list separately for each selected service
    const serviceAssignmentOptions = serviceAssignments.map(
      (assignment: ServiceAssignmentInput) => {
        const qualifiedEmployeeIds = activeEmployees
          .filter((employee) =>
            employee.employeeServices.some(
              (relation) => relation.serviceId === assignment.serviceId
            )
          )
          .map((employee) => employee.id)

        return {
          serviceId: assignment.serviceId,
          requestedEmployeeId: assignment.employeeId,
          qualifiedEmployeeIds,
        };
      }
    );

    // Every service must have at least one active qualified technician
    // and a specifically requested technician must be qualified for that service
    const hasInvalidTechnicianAssignment = serviceAssignmentOptions.some(
      (assignment) =>
        assignment.qualifiedEmployeeIds.length === 0 ||
      (assignment.requestedEmployeeId !== "any" &&
        !assignment.qualifiedEmployeeIds.includes(
          assignment.requestedEmployeeId
        ))
    );

    if (hasInvalidTechnicianAssignment) {
      return Response.json(
        {
          error:
            "One or more technician assignments are invalid for the selected services",
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

    // Every add-on must be valid for the specific service it is assigned to
    const hasInvalidAddon = addonAssignments.some(
      (assignment: AddonAssignmentInput) =>
        !serviceAddonRelations.some(
          (relation) =>
            relation.serviceId === assignment.serviceId &&
            relation.addonId === assignment.addonId
        )
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

    // Build the duration of each individual service work block.
    // An add-on extends only the service it was assigned to.
    const serviceBlocks = services.map((service) => {
      const assignedAddonIds = addonAssignments
        .filter(
          (assignment: AddonAssignmentInput) =>
            assignment.serviceId === service.id
        )
        .map(
          (assignment: AddonAssignmentInput) =>
            assignment.addonId
        );

      const assignedAddons = addons.filter((addon) =>
        assignedAddonIds.includes(addon.id)
      );

      const duration =
        service.estimatedDuration +
        assignedAddons.reduce(
          (total, addon) => total + addon.estimatedDuration,
          0
        );

      const assignmentOption = serviceAssignmentOptions.find(
        (assignment) => assignment.serviceId === service.id
      );

      if (!assignmentOption) {
        throw new Error("Missing technician assignment for service");
      }

      return {
        service,
        addons: assignedAddons,
        duration,
        requestedEmployeeId: assignmentOption.requestedEmployeeId,
        qualifiedEmployeeIds: assignmentOption.qualifiedEmployeeIds,
      };
    });

    // Find technicians who are qualified for every selected nail service.
    // This keeps "Any Technician" from assigning different nail specialists.
    const nailBlocks = serviceBlocks.filter(
      (block) => block.service.category === "NAILS"
    );

    const commonNailEmployeeIds: number[] =
      nailBlocks.length > 0
        ? nailBlocks[0].qualifiedEmployeeIds.filter((employeeId) =>
            nailBlocks.every((block) =>
              block.qualifiedEmployeeIds.includes(employeeId)
            )
          )
        : [];

    // The customer-facing visit is currently scheduled sequentially,
    // so its total duration is the sum of all service work blocks.
    const totalDuration = serviceBlocks.reduce(
      (total, block) => total + block.duration,
      0
    );

    // TEFF business hours depend on the day of the week
    const dayOfWeek = getTeffDayOfWeek(date);

    const openingMinutes =
      dayOfWeek === 0
        ? 10 * 60 + 30 // Sunday: 10:30
        : 9 * 60 + 30; // Monday-Saturday 9:30
    
    // Latest permitted appointment start time.
    // Services may finish after this time.
    const latestStartMinutes =
      dayOfWeek === 0
        ? 17 * 60 // Sunday: 5:00 PM
        : 18 * 60 + 30; // Monday-Saturday: 6:30 PM
      
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const bookingStartMinutes = startHour * 60 + startMinute;

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

    // Validate appointment start time, not finishing time.
    // Keep opening-hour and latest-start restrictions.
    if (
      bookingStartMinutes < openingMinutes ||
      bookingStartMinutes > latestStartMinutes
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

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            // Reuse an existing customer when the phone number already exists.
            const customer = normalizedCustomerPhone
              ? await tx.customer.upsert({
                    where: {
                        phone: normalizedCustomerPhone,
                    },
                    update: {
                        name: normalizedCustomerName,
                        email: normalizedCustomerEmail || null,
                    },
                    create: {
                        name: normalizedCustomerName,
                        phone: normalizedCustomerPhone,
                        email: normalizedCustomerEmail || null,
                    },
                })
              : await tx.customer.create({
                    data: {
                        name: normalizedCustomerName,
                        phone: null,
                        email: normalizedCustomerEmail || null,
                    },
                });

            // One Booking represents the customer's complete salon visit.
            const booking = await tx.booking.create({
              data: {
                customerId: customer.id,
                date: new Date(`${date}T00:00:00.000Z`),
                notes: normalizedCustomerNotes || null,
              },
            });

            // Convert a time such as "10:30" into minutes.
            function timeToMinutes(time: string) {
              const [hours, minutes] = time.split(":").map(Number);

              return hours * 60 + minutes;
            }

            // Convert minutes back into the HH:MM format stored by Appointment.
            function minutesToTime(minutes: number) {
              const hours = Math.floor(minutes / 60);
              const mins = minutes % 60;

              return `${hours.toString().padStart(2, "0")}:${mins
                .toString()
                .padStart(2, "0")}`;
            }

            let blockStart = timeToMinutes(startTime);

            const createdAppointments = [];

            // When the customer chooses "Any Technician" for multiple nail services,
            // resolve the first nail block normally and keep that same technician
            // for the remaining nail services in this booking.
            let resolvedNailEmployeeId: number | null = null;

            // Each service becomes its own technician work block.
            // Customer bookings are scheduled sequentially for now.
            for (const block of serviceBlocks) {
              const blockEnd = blockStart + block.duration;

              // Only technicians qualified for this specific service
              // need to be checked for schedule conflicts.
              const existingAppointments = await tx.appointment.findMany({
                where: {
                  employeeId: {
                    in: block.qualifiedEmployeeIds,
                  },
                  date: new Date(`${date}T00:00:00.000Z`),
                  status: {
                    in: [
                      "BOOKED",
                      "REQUESTED",
                      "CHECKED_IN",
                      "IN_PROGRESS",
                    ],
                  },
                },
              });

              // Schedule blocks represent technician unavailability such as
              // vacation, late arrival, early departure, or personal time.
              const existingScheduleBlocks =
                  await tx.employeeScheduleBlock.findMany({
                      where: {
                          employeeId: {
                              in: block.qualifiedEmployeeIds,
                          },
                          date: new Date(
                              `${date}T00:00:00.000Z`
                          ),
                      },
                  });

              // Keep only technicians who are free during this service block.
              const availableEmployeeIds =
                block.qualifiedEmployeeIds.filter((candidateEmployeeId) => {
                  const hasConflict = existingAppointments.some(
                    (appointment) => {
                      if (
                        appointment.employeeId !== candidateEmployeeId
                      ) {
                        return false;
                      }

                      const existingStart = timeToMinutes(
                        appointment.startTime
                      );

                      const existingEnd =
                        existingStart + appointment.duration;

                      return (
                        blockStart < existingEnd &&
                        blockEnd > existingStart
                      );
                    }
                  );

                  const hasScheduleBlockConflict =
                    existingScheduleBlocks.some(
                        (scheduleBlock) => {
                            if (
                                scheduleBlock.employeeId !==
                                candidateEmployeeId
                            ) {
                                return false;
                            }

                            const blockedStart =
                                timeToMinutes(
                                    scheduleBlock.startTime
                                );

                            const blockedEnd =
                                timeToMinutes(
                                    scheduleBlock.endTime
                                );

                            return (
                                blockStart < blockedEnd &&
                                blockEnd > blockedStart
                            );
                        }
                    );

                  return (
                      !hasConflict &&
                      !hasScheduleBlockConflict
                  );
                });

              const isNailService = block.service.category === "NAILS";

              // Respect a specific technician choice when one was requested.
              const selectableEmployeeIds: number[] =
                block.requestedEmployeeId === "any"
                  ? isNailService
                    ? resolvedNailEmployeeId !== null
                      // After choosing the nail tech, keep that same tech for later nail blocks.
                      ? availableEmployeeIds.filter(
                          (candidateEmployeeId: number) =>
                            candidateEmployeeId === resolvedNailEmployeeId
                        )
                      // For the first nail block, only consider techs qualified
                      // for every nail service in this booking.
                      : availableEmployeeIds.filter(
                          (candidateEmployeeId: number) =>
                            commonNailEmployeeIds.includes(candidateEmployeeId)
                        )
                    : availableEmployeeIds
                  : availableEmployeeIds.filter(
                      (candidateEmployeeId: number) =>
                        candidateEmployeeId === block.requestedEmployeeId
                    );

              if (selectableEmployeeIds.length === 0) {
                throw new Error("BOOKING_CONFLICT");
              }

              // "Any Technician" is balanced by scheduled workload.
              // A specifically selected technician always keeps that choice.
              const assignedEmployeeId: number =
                block.requestedEmployeeId === "any"
                  ? selectableEmployeeIds.reduce(
                      (bestEmployeeId: number, currentEmployeeId: number) => {
                        const scheduledMinutes = (candidateId: number) =>
                          existingAppointments
                            .filter(
                              (appointment) =>
                                appointment.employeeId === candidateId
                            )
                            .reduce(
                              (total, appointment) =>
                                total + appointment.duration,
                              0
                            );

                        const bestMinutes =
                          scheduledMinutes(bestEmployeeId);

                        const currentMinutes =
                          scheduledMinutes(currentEmployeeId);

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
                      }
                    )
                  : selectableEmployeeIds[0];

              // Once "Any Technician" resolves for the first nail service,
              // keep that technician for the rest of this booking's nail services
              if (
                isNailService &&
                block.requestedEmployeeId === "any" &&
                resolvedNailEmployeeId === null
              ) {
                resolvedNailEmployeeId = assignedEmployeeId;
              }

              // Approval applies to the individual service block.
              // Example: nails may be BOOKED while lashes are REQUESTED.
              const blockStatus = block.service.requiresApproval
                ? "REQUESTED"
                : "BOOKED";

              const appointment = await tx.appointment.create({
                data: {
                  bookingId: booking.id,
                  customerId: customer.id,
                  employeeId: assignedEmployeeId,
                  date: new Date(`${date}T00:00:00.000Z`),
                  startTime: minutesToTime(blockStart),
                  duration: block.duration,
                  status: blockStatus,
                  notes: normalizedCustomerNotes || null,

                  appointmentServices: {
                    create: {
                      serviceId: block.service.id,
                      bookedPrice: block.service.price,
                      bookedDuration:
                        block.service.estimatedDuration,
                    },
                  },

                  appointmentAddons: {
                    create: block.addons.map((addon) => ({
                      addonId: addon.id,
                      bookedPrice: addon.price,
                      bookedDuration: addon.estimatedDuration,
                    })),
                  },
                },

                include: {
                  employee: true,
                  appointmentServices: true,
                  appointmentAddons: true,
                },
              });

              createdAppointments.push(appointment);

              // The next service begins when this one finishes.
              blockStart = blockEnd;
            }

            return {
              booking,
              customer,
              appointments: createdAppointments,
            };
          },
          {
            // PostgreSQL prevents concurrent transactions from silently conflicting.
            isolationLevel: "Serializable",
          }
        );

        // Transaction succeeded, so no retry is needed.
        break;
      } catch (error) {
        // A normal occupied-slot conflict should not be retried.
        if (
          error instanceof Error &&
          error.message === "BOOKING_CONFLICT"
        ) {
          throw error;
        }

        // Prisma uses P2034 for transaction write/serialization conflicts.
        const isSerializableConflict =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2034";

        if (!isSerializableConflict) {
          throw error;
        }

        // If all retry attempts were used, treat the slot as unavailable.
        if (attempt === maxAttempts) {
          throw new Error("BOOKING_CONFLICT");
        }

        // Otherwise retry the entire availability check + booking transaction.
      }
    }

    if (!result) {
      throw new Error("Unable to complete booking transaction");
    }

    // Notify registered TEFF staff devices after the booking transaction
    // succeeds. Push failures must never cause a valid booking to fail
    try {
      const pushSubscriptions =
        await prisma.pushSubscription.findMany({
          where: {
            user: {
              active: true,
              role: {
                in: ["OWNER", "RECEPTIONIST"],
              },
            },
          },
        });

      if (pushSubscriptions.length > 0) {
        const firstAppointment =
          result.appointments[0];

        const serviceNames = result.appointments
          .flatMap((appointment) =>
            appointment.appointmentServices.map(
              (appointmentService) => {
                const service = serviceBlocks.find(
                  (block) =>
                    block.service.id ===
                    appointmentService.serviceId
                );

                return service?.service.nameEs;
              }
            )
          )
          .filter(
            (name): name is string =>
              typeof name === "string"
          );

        const serviceSummary =
          serviceNames.length > 2
            ? `${serviceNames
                .slice(0, 2)
                .join(", ")} +${serviceNames.length - 2}`
            : serviceNames.join(", ");

        const notificationBody = [
          result.customer.name,
          serviceSummary,
          firstAppointment
            ? `${date} · ${firstAppointment.startTime}`
            : date,
        ]
          .filter(Boolean)
          .join(" · ");

        await Promise.allSettled(
          pushSubscriptions.map(
            async (subscription) => {
              try {
                await sendPushNotification(
                  subscription,
                  {
                    title: "🔔 Nueva Reserva",
                    body: notificationBody,
                    url: "/receptionist",
                  }
                );
              } catch (error) {
                console.error(
                  `Booking push failed for subscription ${subscription.id}:`,
                  error
                );

                // Remove subscriptions that the browser/push provider
                // says no longer exist.
                const statusCode =
                  typeof error === "object" &&
                  error !== null &&
                  "statusCode" in error
                    ? Number(error.statusCode)
                    : null;

                if (
                  statusCode === 404 ||
                  statusCode === 410
                ) {
                  await prisma.pushSubscription
                    .delete({
                      where: {
                        id: subscription.id,
                      },
                    })
                    .catch(() => {
                      // A concurrent request may already have removed it
                    });
                }
              }
            }
          )
        );
      }
    } catch (error) {
      // Booking already succeeded. Notification infrastructure must
      // never turn a successful reservation into an API failure
      console.error(
        "Unable to send new-booking push notifications:",
        error
      );
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