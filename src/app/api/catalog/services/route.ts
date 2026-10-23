import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await auth();

    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    // OWNER and RECEPTIONIST can manage the TEFF catalog.
    if (!canManageStaff(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    try {
        const services =
            await prisma.service.findMany({
                orderBy: [
                    {
                        category: "asc",
                    },
                    {
                        nameEs: "asc",
                    },
                ],
            });

        return Response.json(services);
    } catch (error) {
        console.error(
            "Failed to load service catalog:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to load service catalog",
            },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
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
        const body = await request.json();

        const {
            nameEs,
            nameEn,
            category,
            price,
            estimatedDuration,
            requiresApproval,
            employeeIds,
        } = body;

        if (
            typeof nameEs !== "string" ||
            !nameEs.trim() ||
            typeof nameEn !== "string" ||
            !nameEn.trim() ||
            typeof category !== "string" ||
            !category.trim() ||
            !Number.isInteger(price) ||
            price < 0 ||
            !Number.isInteger(estimatedDuration) ||
            estimatedDuration <= 0 ||
            typeof requiresApproval !== "boolean" ||
            !Array.isArray(employeeIds) ||
            employeeIds.length === 0 ||
            employeeIds.some(
                (employeeId) =>
                    !Number.isInteger(employeeId) ||
                    employeeId <= 0
            )
        ) {
            return Response.json(
                {
                    error:
                        "Invalid service information",
                },
                { status: 400 }
            );
        }

        const uniqueEmployeeIds = [
            ...new Set<number>(employeeIds),
        ];

        // Only active technicians may be assigned to a new service.
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

        const service =
            await prisma.$transaction(
                async (tx) => {
                    const createdService =
                        await tx.service.create({
                            data: {
                                nameEs:
                                    nameEs.trim(),
                                nameEn:
                                    nameEn.trim(),
                                category:
                                    category.trim(),
                                price,
                                estimatedDuration,
                                requiresApproval,
                                active: true,
                            },
                        });

                    await tx.employeeService.createMany({
                        data: uniqueEmployeeIds.map(
                            (employeeId) => ({
                                serviceId:
                                    createdService.id,
                                employeeId,
                            })
                        ),
                        skipDuplicates: true,
                    });

                    return createdService;
                }
            );

        return Response.json(
            service,
            { status: 201 }
        );
    } catch (error) {
        console.error(
            "Failed to create service:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to create service",
            },
            { status: 500 }
        );
    }
}