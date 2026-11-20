export type QuickBookingPlanService = {
  id: number;
  employeeId: number;
  estimatedDuration: number;
  price: number;
  requiresApproval: boolean;
};

export type QuickBookingPlannedAppointment = {
  serviceId: number;
  employeeId: number;
  startTime: string;
  startMinutes: number;
  endMinutes: number;
  duration: number;
  bookedPrice: number;
  status: "BOOKED" | "REQUESTED";
};

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function buildQuickBookingPlan(
  startTime: string,
  services: QuickBookingPlanService[],
): QuickBookingPlannedAppointment[] {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw new Error("INVALID_BOOKING_TIME");
  }

  if (services.length === 0 || services.length > 20) {
    throw new Error("INVALID_BOOKING_SERVICES");
  }

  // Match TEFF's existing public booking service ordering.
  const orderedServices = [...services].sort((a, b) => a.id - b.id);

  const planned: QuickBookingPlannedAppointment[] = [];
  let cursor = timeToMinutes(startTime);

  for (const service of orderedServices) {
    if (
      !Number.isSafeInteger(service.id) ||
      service.id <= 0 ||
      !Number.isSafeInteger(service.employeeId) ||
      service.employeeId <= 0 ||
      !Number.isSafeInteger(service.estimatedDuration) ||
      service.estimatedDuration <= 0 ||
      !Number.isSafeInteger(service.price) ||
      service.price < 0
    ) {
      throw new Error("INVALID_BOOKING_SERVICE");
    }

    const endMinutes = cursor + service.estimatedDuration;

    // Appointment dates are stored separately from start times.
    // Do not silently wrap a service into the next calendar day.
    if (cursor >= 24 * 60 || endMinutes > 24 * 60) {
      throw new Error("BOOKING_EXCEEDS_CALENDAR_DAY");
    }

    planned.push({
      serviceId: service.id,
      employeeId: service.employeeId,
      startTime: minutesToTime(cursor),
      startMinutes: cursor,
      endMinutes,
      duration: service.estimatedDuration,
      bookedPrice: service.price,
      status: service.requiresApproval ? "REQUESTED" : "BOOKED",
    });

    cursor = endMinutes;
  }

  return planned;
}
