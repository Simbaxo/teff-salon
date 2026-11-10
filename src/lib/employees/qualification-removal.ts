import type { Prisma, PrismaClient } from "@/generated/prisma/client";

type QualificationTransaction = Prisma.TransactionClient;

export const UNFINISHED_APPOINTMENT_STATUSES = [
  "REQUESTED",
  "BOOKED",
  "CHECKED_IN",
  "IN_PROGRESS",
] as const;

export async function hasUnfinishedServiceAppointments(
  tx: QualificationTransaction,
  employeeId: number,
  serviceId: number,
): Promise<boolean> {
  const count = await tx.appointment.count({
    where: {
      employeeId,
      status: {
        in: [...UNFINISHED_APPOINTMENT_STATUSES],
      },
      appointmentServices: {
        some: {
          serviceId,
        },
      },
    },
  });

  return count > 0;
}
export async function hasOtherQualifiedEmployee(
  tx: QualificationTransaction,
  employeeId: number,
  serviceId: number,
): Promise<boolean> {
  const count = await tx.employee.count({
    where: {
      id: { not: employeeId },
      active: true,
      compensationType: "COMMISSION",
      employeeServices: {
        some: { serviceId },
      },
    },
  });

  return count > 0;
}
export type QualificationRemovalResult =
  | { status: 200; success: true }
  | { status: 404 | 409; error: string };

export async function removeEmployeeQualification(
  prisma: PrismaClient,
  employeeId: number,
  serviceId: number,
): Promise<QualificationRemovalResult> {
  if (
    !Number.isSafeInteger(employeeId) ||
    employeeId <= 0 ||
    !Number.isSafeInteger(serviceId) ||
    serviceId <= 0
  ) {
    return {
      status: 409,
      error: "ID de empleado o servicio inválido.",
    };
  }

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<QualificationRemovalResult> => {
          // Lock the service before the employee.
          // Coordinate with other qualification changes.
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(73422, ${serviceId})
          `;

          // Coordinate with booking creation and reassignment.
          await tx.$executeRaw`
            SELECT pg_advisory_xact_lock(73421, ${employeeId})
          `;

          const qualification = await tx.employeeService.findUnique({
            where: {
              employeeId_serviceId: {
                employeeId,
                serviceId,
              },
            },
          });

          if (!qualification) {
            return {
              status: 404,
              error: "El empleado no tiene asignado este servicio.",
            };
          }

          const hasUnfinishedAppointments =
            await hasUnfinishedServiceAppointments(tx, employeeId, serviceId);

          if (hasUnfinishedAppointments) {
            return {
              status: 409,
              error:
                "Este empleado tiene citas pendientes para este servicio. " +
                "Resuélvelas o reasígnalas antes de quitarlo.",
            };
          }

          const service = await tx.service.findUnique({
            where: { id: serviceId },
            select: { active: true },
          });

          if (service?.active) {
            const hasOtherEmployee = await hasOtherQualifiedEmployee(
              tx,
              employeeId,
              serviceId,
            );

            if (!hasOtherEmployee) {
              return {
                status: 409,
                error:
                  "No se puede quitar el último empleado activo " +
                  "y calificado para este servicio.",
              };
            }
          }

          await tx.employeeService.delete({
            where: {
              employeeId_serviceId: {
                employeeId,
                serviceId,
              },
            },
          });

          return { status: 200, success: true };
        },
        {
          isolationLevel: "Serializable",
          maxWait: 10000,
          timeout: 15000,
        },
      );
    } catch (error) {
      const isSerializableConflict =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2034";

      if (!isSerializableConflict) {
        throw error;
      }

      if (attempt === maxAttempts) {
        return {
          status: 409,
          error:
            "Otro cambio ocurrió al mismo tiempo. " +
            "Intenta quitar el servicio nuevamente.",
        };
      }
    }
  }

  return {
    status: 409,
    error: "No se pudo completar la actualización.",
  };
}
