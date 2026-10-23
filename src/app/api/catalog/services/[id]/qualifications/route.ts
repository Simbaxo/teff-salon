import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export async function PUT(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (!canManageStaff(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    try {
        const { id } = await context.params;
        const serviceId = Number(id);
        const body = await request.json();

        const employeeIds = body.employeeIds;

        if (
            !Number.isInteger(serviceId) ||
            serviceId <= 0 ||
            !Array.isArray(employeeIds) ||
            employeeIds.some(
                (employeeId) =>
                    !Number.isInteger(employeeId) ||
                    employeeId <= 0
            )
        ) {
            return Response.json(
                {
                    error:
                        "Invalid service qualifications",
                },
                { status: 400 }
            );
        }

        const uniqueEmployeeIds = [
            ...new Set<number>(employeeIds),
        ];

        const service =
            await prisma.service.findUnique({
                where: {
                    id: serviceId,
                },
                select: {
                    id: true,
                    active: true,
                },
            });

        if (!service) {
            return Response.json(
                { error: "Service not found" },
                { status: 404 }
            );
        }

        // Active services must always have at least one qualified technician.
        if (
            service.active &&
            uniqueEmployeeIds.length === 0
        ) {
            return Response.json(
                {
                    error:
                        "An active service must have at least one qualified employee",
                },
                { status: 400 }
            );
        }

        if (uniqueEmployeeIds.length > 0) {
            const validEmployees =
                await prisma.employee.findMany({
                    where: {
                        id: {
                            in: uniqueEmployeeIds,
                        },
                        active: true,
                        isBookable: true,
                    },
                    select: {
                        id: true,
                    },
                });

            if (
                validEmployees.length !==
                uniqueEmployeeIds.length
            ) {
                return Response.json(
                    {
                        error:
                            "One or more employees are invalid or inactive",
                    },
                    { status: 400 }
                );
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.employeeService.deleteMany({
                where: {
                    serviceId,
                },
            });

            if (uniqueEmployeeIds.length > 0) {
                await tx.employeeService.createMany({
                    data: uniqueEmployeeIds.map(
                        (employeeId) => ({
                            serviceId,
                            employeeId,
                        })
                    ),
                    skipDuplicates: true,
                });
            }
        });

        const qualifications =
            await prisma.employeeService.findMany({
                where: {
                    serviceId,
                },
                orderBy: {
                    employeeId: "asc",
                },
            });

        return Response.json(qualifications);
    } catch (error) {
        console.error(
            "Failed to update service qualifications:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to update service qualifications",
            },
            { status: 500 }
        );
    }
}