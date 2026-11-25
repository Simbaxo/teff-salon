import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { queueGoogleCalendarSync } from "@/lib/google-calendar/queue";
import { triggerGoogleCalendarSync } from "@/lib/google-calendar/trigger-sync";

export const runtime = "nodejs";

type RangeRequest = {
  employeeId: number;
  startDate: string;
  endDate: string;
  reason?: string;
  confirmExistingAppointments?: boolean;
};

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return date;
}

function datesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];

  for (
    let cursor = start.getTime();
    cursor <= end.getTime();
    cursor += 86_400_000
  ) {
    dates.push(new Date(cursor));
  }

  return dates;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: RangeRequest;

  try {
    body = (await request.json()) as RangeRequest;
  } catch {
    return Response.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (
    !body ||
    !Number.isSafeInteger(body.employeeId) ||
    body.employeeId <= 0 ||
    typeof body.startDate !== "string" ||
    typeof body.endDate !== "string" ||
    (body.reason !== undefined && typeof body.reason !== "string") ||
    (body.confirmExistingAppointments !== undefined &&
      typeof body.confirmExistingAppointments !== "boolean")
  ) {
    return Response.json(
      { error: "Datos del bloqueo inválidos." },
      { status: 400 },
    );
  }

  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  const reason = body.reason?.trim() || null;

  if (!startDate || !endDate || startDate > endDate) {
    return Response.json(
      { error: "El rango de fechas es inválido." },
      { status: 400 },
    );
  }

  if (reason && reason.length > 200) {
    return Response.json(
      { error: "El motivo no puede superar 200 caracteres." },
      { status: 400 },
    );
  }

  const dates = datesInRange(startDate, endDate);

  // Keep large accidental date ranges out of the schedule.
  if (dates.length > 60) {
    return Response.json(
      { error: "El rango máximo es de 60 días." },
      { status: 400 },
    );
  }

  const groupId = randomUUID();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Coordinate with TEFF's appointment booking locks.
          await tx.$queryRaw`
            SELECT pg_advisory_xact_lock(
              73421,
              ${body.employeeId}
            )::text
          `;

          const employee = await tx.employee.findFirst({
            where: {
              id: body.employeeId,
              active: true,
            },
            select: {
              id: true,
              name: true,
            },
          });

          if (!employee) {
            return {
              type: "INVALID_EMPLOYEE" as const,
            };
          }

          // A vacation cannot overwrite an existing schedule block.
          const existingBlocks = await tx.employeeScheduleBlock.findMany({
            where: {
              employeeId: body.employeeId,
              date: {
                gte: startDate,
                lte: endDate,
              },
            },
            select: {
              id: true,
              date: true,
            },
          });

          if (existingBlocks.length > 0) {
            return {
              type: "BLOCK_CONFLICT" as const,
              count: existingBlocks.length,
            };
          }

          // Existing appointments are not automatically cancelled.
          const appointments = await tx.appointment.findMany({
            where: {
              employeeId: body.employeeId,
              date: {
                gte: startDate,
                lte: endDate,
              },
              status: {
                in: ["REQUESTED", "BOOKED", "CHECKED_IN", "IN_PROGRESS"],
              },
            },
            select: {
              id: true,
              date: true,
              startTime: true,
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
          });

          if (
            appointments.length > 0 &&
            body.confirmExistingAppointments !== true
          ) {
            return {
              type: "APPOINTMENT_WARNING" as const,
              count: appointments.length,
              appointments: appointments.slice(0, 10),
            };
          }

          // One complete-day block per date, sharing one groupId.
          const blocks = await Promise.all(
            dates.map((date) =>
              tx.employeeScheduleBlock.create({
                data: {
                  employeeId: body.employeeId,
                  date,
                  startTime: "00:00",
                  endTime: "23:59",
                  reason,
                  groupId,
                },
                select: {
                  id: true,
                },
              }),
            ),
          );

          if (process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true") {
            for (const block of blocks) {
              await queueGoogleCalendarSync(tx, "SCHEDULE_BLOCK", block.id);
            }
          }

          return {
            type: "CREATED" as const,
            groupId,
            employeeId: employee.id,
            employeeName: employee.name,
            startDate: body.startDate,
            endDate: body.endDate,
            daysBlocked: dates.length,
            blockIds: blocks.map((block) => block.id),
            affectedAppointments: appointments.length,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );

      if (result.type === "INVALID_EMPLOYEE") {
        return Response.json(
          { error: "La técnica no está disponible." },
          { status: 400 },
        );
      }

      if (result.type === "BLOCK_CONFLICT") {
        return Response.json(
          {
            error: "Ya existen horarios bloqueados dentro de este rango.",
            conflictType: "SCHEDULE_BLOCK",
            count: result.count,
          },
          { status: 409 },
        );
      }

      if (result.type === "APPOINTMENT_WARNING") {
        return Response.json(
          {
            error: "La técnica tiene citas programadas durante estas fechas.",
            conflictType: "EXISTING_APPOINTMENTS",
            count: result.count,
            appointments: result.appointments,
          },
          { status: 409 },
        );
      }

      // Trigger Google Calendar synchronization only after
      // the schedule block range transaction has committed.
      if (process.env.TEFF_GOOGLE_CALENDAR_QUEUE_ENABLED === "true") {
        triggerGoogleCalendarSync();
      }

      return Response.json({ success: true, ...result }, { status: 201 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }

      console.error("Failed to create vacation blocks:", error);

      return Response.json(
        {
          error: "No se pudieron guardar los bloqueos. Intenta nuevamente.",
        },
        { status: 500 },
      );
    }
  }

  return Response.json(
    { error: "No se pudo completar la solicitud." },
    { status: 500 },
  );
}
