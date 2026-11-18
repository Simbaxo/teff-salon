import type { GoogleCalendarSyncTarget } from "@/generated/prisma/enums";
import { getTeffDayStart, TEFF_TIME_ZONE } from "@/lib/datetime";
import { prisma } from "@/lib/prisma";
import { getGoogleCalendarEventId } from "./event-id";

type CalendarEventTime = {
  dateTime: string;
  timeZone: string;
};

type CalendarEventPayload = {
  id: string;
  summary: string;
  description?: string;
  start: CalendarEventTime;
  end: CalendarEventTime;
  colorId: string;
};

function getTechnicianColorId(employeeId: number): string {
  return String(((employeeId - 1) % 11) + 1);
}

function getEventTime(date: Date, minutes: number): CalendarEventTime {
  const day = date.toISOString().slice(0, 10);
  const midnight = getTeffDayStart(day);

  return {
    dateTime: new Date(midnight.getTime() + minutes * 60_000).toISOString(),
    timeZone: TEFF_TIME_ZONE,
  };
}

function getMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function getGoogleCalendarEventPayload(
  target: GoogleCalendarSyncTarget,
  targetId: number,
): Promise<CalendarEventPayload | null> {
  const id = getGoogleCalendarEventId(target, targetId);

  if (target === "SCHEDULE_BLOCK") {
    const block = await prisma.employeeScheduleBlock.findUnique({
      where: { id: targetId },
      select: {
        date: true,
        startTime: true,
        endTime: true,
        employeeId: true,
        employee: { select: { name: true } },
      },
    });

    if (!block) return null;

    return {
      id,
      summary: `${block.employee.name} · Horario bloqueado`,
      colorId: getTechnicianColorId(block.employeeId),
      start: getEventTime(block.date, getMinutes(block.startTime)),
      end: getEventTime(block.date, getMinutes(block.endTime)),
    };
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: targetId },
    select: {
      date: true,
      startTime: true,
      duration: true,
      status: true,
      employeeId: true,
      employee: { select: { name: true } },
      customer: { select: { name: true } },
      appointmentServices: {
        orderBy: { serviceId: "asc" },
        select: { service: { select: { nameEs: true } } },
      },
    },
  });

  if (
    !appointment ||
    appointment.status === "REQUESTED" ||
    appointment.status === "CANCELLED"
  ) {
    return null;
  }

  const services = appointment.appointmentServices
    .map(({ service }) => service.nameEs)
    .join(", ");
  const startMinutes = getMinutes(appointment.startTime);

  return {
    id,
    summary: `${appointment.employee.name} · ${services || "Cita"}`,
    description: `Cliente: ${appointment.customer.name}`,
    colorId: getTechnicianColorId(appointment.employeeId),
    start: getEventTime(appointment.date, startMinutes),
    end: getEventTime(appointment.date, startMinutes + appointment.duration),
  };
}
