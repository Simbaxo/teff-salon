import { auth } from "@/auth";
import { getTeffToday } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { getTeffCurrentMinutes } from "@/lib/datetime";
import { normalizePhoneNumber } from "@/lib/phone";
import { isOutsideStaffScheduleHours } from "@/lib/appointments/staff-scheduling";
import { Prisma } from "@/generated/prisma/client";
import { triggerGoogleCalendarSync } from "@/lib/google-calendar/trigger-sync";
import {
  createQuickBooking,
  getQuickBookingRequestHash,
} from "@/lib/appointments/create-quick-booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CustomerInput =
  | {
      kind: "existing";
      id: number;
    }
  | {
      kind: "new";
      name: string;
      phone: string;
      email: string;
    };

type ServiceInput = {
  serviceId: number;
  employeeId: number;
};

type QuickBookingRequest = {
  requestKey: string;
  customer: CustomerInput;
  services: ServiceInput[];
  date: string;
  startTime: string;
  overrideOverlap?: boolean;
  overrideOutsideHours?: boolean;
};

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isValidCustomer(value: unknown): value is CustomerInput {
  if (!value || typeof value !== "object") return false;

  const customer = value as Record<string, unknown>;

  if (customer.kind === "existing") {
    return Number.isSafeInteger(customer.id) && Number(customer.id) > 0;
  }

  if (customer.kind === "new") {
    return (
      typeof customer.name === "string" &&
      customer.name.trim().length > 0 &&
      customer.name.length <= 100 &&
      typeof customer.phone === "string" &&
      customer.phone.trim().length > 0 &&
      customer.phone.length <= 30 &&
      typeof customer.email === "string" &&
      customer.email.length <= 254
    );
  }

  return false;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "OWNER" && session.user.role !== "RECEPTIONIST") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: QuickBookingRequest;

  try {
    body = (await request.json()) as QuickBookingRequest;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (
    !body ||
    typeof body.requestKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.requestKey,
    ) ||
    !isValidCustomer(body.customer) ||
    typeof body.date !== "string" ||
    !isValidDate(body.date) ||
    typeof body.startTime !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime) ||
    !Array.isArray(body.services) ||
    body.services.length === 0 ||
    body.services.length > 20 ||
    (body.overrideOverlap !== undefined &&
      typeof body.overrideOverlap !== "boolean") ||
    (body.overrideOutsideHours !== undefined &&
      typeof body.overrideOutsideHours !== "boolean")
  ) {
    return Response.json(
      { error: "Información de reserva inválida." },
      { status: 400 },
    );
  }

  const serviceIds = new Set<number>();

  for (const service of body.services) {
    if (
      !service ||
      !Number.isSafeInteger(service.serviceId) ||
      service.serviceId <= 0 ||
      !Number.isSafeInteger(service.employeeId) ||
      service.employeeId <= 0 ||
      serviceIds.has(service.serviceId)
    ) {
      return Response.json(
        { error: "Servicios o técnicas inválidos." },
        { status: 400 },
      );
    }

    serviceIds.add(service.serviceId);
  }

  // Recover a previously saved booking before checking dates,
  // availability, or other conditions that may have changed.
  const previousBooking = await prisma.booking.findUnique({
    where: {
      internalRequestKey: body.requestKey.toLowerCase(),
    },
    select: {
      id: true,
      customerId: true,
      internalRequestHash: true,
      appointments: {
        select: {
          id: true,
        },
        orderBy: {
          id: "asc",
        },
      },
    },
  });

  if (previousBooking) {
    const requestHash = getQuickBookingRequestHash({
      customer: body.customer,
      services: body.services,
      date: body.date,
      startTime: body.startTime,
    });

    if (previousBooking.internalRequestHash !== requestHash) {
      return Response.json(
        {
          error:
            "Esta solicitud ya fue utilizada para otra reserva. Inicia una reserva nueva.",
        },
        { status: 409 },
      );
    }

    return Response.json({
      success: true,
      bookingId: previousBooking.id,
      customerId: previousBooking.customerId,
      appointmentIds: previousBooking.appointments.map(
        (appointment) => appointment.id,
      ),
      duplicate: true,
    });
  }

  // Only new bookings must pass the current date check.
  if (body.date < getTeffToday()) {
    return Response.json(
      { error: "La fecha de la cita no puede estar en el pasado." },
      { status: 400 },
    );
  }

  // Verify all requested services against the current catalog.
  const services = await prisma.service.findMany({
    where: {
      id: { in: [...serviceIds] },
      active: true,
    },
    select: {
      id: true,
      nameEs: true,
      category: true,
      price: true,
      estimatedDuration: true,
      requiresApproval: true,
    },
  });

  if (services.length !== serviceIds.size) {
    return Response.json(
      { error: "Uno o más servicios no están disponibles." },
      { status: 400 },
    );
  }

  const employeeIds = [
    ...new Set(body.services.map((service) => service.employeeId)),
  ];

  // Only active, bookable, commission-based technicians qualify.
  const employees = await prisma.employee.findMany({
    where: {
      id: { in: employeeIds },
      active: true,
      isBookable: true,
      compensationType: "COMMISSION",
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

  if (employees.length !== employeeIds.length) {
    return Response.json(
      { error: "Una o más técnicas no están disponibles." },
      { status: 400 },
    );
  }

  const servicesById = new Map(
    services.map((service) => [service.id, service]),
  );

  const employeesById = new Map(
    employees.map((employee) => [employee.id, employee]),
  );

  for (const selection of body.services) {
    const employee = employeesById.get(selection.employeeId);

    const isQualified = employee?.employeeServices.some(
      (assignment) => assignment.serviceId === selection.serviceId,
    );

    if (!isQualified) {
      return Response.json(
        {
          error:
            "La técnica seleccionada no tiene asignado uno de los servicios.",
        },
        { status: 400 },
      );
    }
  }

  // Preserve TEFF's rule that nail services within one
  // booking must be assigned to the same technician.
  const nailEmployeeIds = new Set(
    body.services
      .filter(
        (selection) =>
          servicesById.get(selection.serviceId)?.category === "NAILS",
      )
      .map((selection) => selection.employeeId),
  );

  if (nailEmployeeIds.size > 1) {
    return Response.json(
      {
        error:
          "Los servicios de uñas de una misma reserva deben tener la misma técnica.",
      },
      { status: 400 },
    );
  }

  // Validate the customer before creating any database records.
  if (body.customer.kind === "existing") {
    const customer = await prisma.customer.findUnique({
      where: { id: body.customer.id },
      select: { id: true },
    });

    if (!customer) {
      return Response.json(
        { error: "El cliente seleccionado ya no existe." },
        { status: 404 },
      );
    }
  } else {
    const normalizedPhone = normalizePhoneNumber(body.customer.phone);

    if (!normalizedPhone) {
      return Response.json(
        { error: "Ingresa un número de celular válido." },
        { status: 400 },
      );
    }

    const email = body.customer.email.trim();

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Ingresa un correo electrónico válido." },
        { status: 400 },
      );
    }
  }

  // Reject appointment start times that have already passed today.
  if (body.date === getTeffToday()) {
    const [hours, minutes] = body.startTime.split(":").map(Number);
    const startMinutes = hours * 60 + minutes;

    if (startMinutes <= getTeffCurrentMinutes()) {
      return Response.json(
        { error: "La hora seleccionada ya pasó." },
        { status: 400 },
      );
    }
  }

  // OWNER and RECEPTIONIST may book outside normal hours,
  // but the browser must explicitly confirm the exception.
  if (
    isOutsideStaffScheduleHours(body.date, body.startTime) &&
    body.overrideOutsideHours !== true
  ) {
    return Response.json(
      {
        error:
          "La hora seleccionada está fuera del horario habitual del salón.",
        conflictType: "OUTSIDE_HOURS",
      },
      { status: 409 },
    );
  }

  // Retry the entire transaction if PostgreSQL reports
  // a serialization conflict caused by concurrent changes.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await createQuickBooking({
        requestKey: body.requestKey,
        customer: body.customer,
        services: body.services,
        date: body.date,
        startTime: body.startTime,
        overrideOverlap: body.overrideOverlap === true,
        overrideOutsideHours: body.overrideOutsideHours === true,
      });

      // Trigger Google Calendar synchronization after a successful
      // transaction, without reprocessing duplicate booking requests.
      if (
        !result.duplicate &&
        process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true"
      ) {
        triggerGoogleCalendarSync();
      }

      return Response.json(
        {
          success: true,
          ...result,
        },
        { status: result.duplicate ? 200 : 201 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        if (attempt < 2) continue;

        return Response.json(
          {
            error:
              "La agenda cambió mientras se guardaba la reserva. Intenta nuevamente.",
          },
          { status: 409 },
        );
      }

      if (error instanceof Error) {
        const responses: Record<
          string,
          {
            status: number;
            message: string;
            conflictType?: string;
          }
        > = {
          QUICK_BOOKING_REQUEST_KEY_CONFLICT: {
            status: 409,
            message:
              "Esta solicitud ya fue utilizada para otra reserva. Inicia una reserva nueva.",
          },
          QUICK_BOOKING_INVALID_REQUEST_KEY: {
            status: 400,
            message: "Identificador de reserva inválido.",
          },
          QUICK_BOOKING_INVALID_SERVICE: {
            status: 400,
            message: "Uno o más servicios ya no están disponibles.",
          },
          QUICK_BOOKING_INVALID_EMPLOYEE: {
            status: 400,
            message:
              "La técnica seleccionada ya no está disponible para este servicio.",
          },
          QUICK_BOOKING_INVALID_CUSTOMER: {
            status: 400,
            message: "Información del cliente inválida.",
          },
          QUICK_BOOKING_CUSTOMER_NOT_FOUND: {
            status: 404,
            message: "El cliente seleccionado ya no existe.",
          },
          QUICK_BOOKING_PAST_TIME: {
            status: 400,
            message: "La fecha u hora seleccionada ya pasó.",
          },
          QUICK_BOOKING_OUTSIDE_HOURS: {
            status: 409,
            message: "La hora está fuera del horario habitual del salón.",
            conflictType: "OUTSIDE_HOURS",
          },
          QUICK_BOOKING_OVERLAP: {
            status: 409,
            message: "La técnica ya tiene una cita en ese horario.",
            conflictType: "APPOINTMENT",
          },
          QUICK_BOOKING_SCHEDULE_BLOCK: {
            status: 409,
            message:
              "La técnica tiene un bloqueo de agenda y no está disponible.",
            conflictType: "SCHEDULE_BLOCK",
          },
          BOOKING_EXCEEDS_CALENDAR_DAY: {
            status: 400,
            message:
              "Los servicios no pueden extenderse hasta el día siguiente.",
          },
          INVALID_BOOKING_PLAN: {
            status: 400,
            message: "La reserva no contiene servicios válidos.",
          },
          INVALID_BOOKING_TIME: {
            status: 400,
            message: "Hora de reserva inválida.",
          },
          INVALID_BOOKING_SERVICES: {
            status: 400,
            message: "Selecciona servicios válidos.",
          },
          INVALID_BOOKING_SERVICE: {
            status: 400,
            message: "Uno de los servicios contiene datos inválidos.",
          },
        };

        const response = responses[error.message];

        if (response) {
          return Response.json(
            {
              error: response.message,
              ...(response.conflictType
                ? { conflictType: response.conflictType }
                : {}),
            },
            { status: response.status },
          );
        }
      }

      console.error("Quick Booking creation failed:", error);

      return Response.json(
        {
          error: "No se pudo guardar la reserva. Intenta nuevamente.",
        },
        { status: 500 },
      );
    }
  }

  return Response.json(
    { error: "No se pudo completar la reserva." },
    { status: 500 },
  );
}
