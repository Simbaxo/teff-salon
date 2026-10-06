import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export async function PATCH(
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

    // OWNER and RECEPTIONIST can manage the service catalog.
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

        const {
            nameEs,
            nameEn,
            category,
            price,
            estimatedDuration,
            requiresApproval,
            active,
        } = body;

        if (
            !Number.isInteger(serviceId) ||
            serviceId <= 0
        ) {
            return Response.json(
                { error: "Invalid service" },
                { status: 400 }
            );
        }

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
            typeof active !== "boolean"
        ) {
            return Response.json(
                {
                    error:
                        "Invalid service information",
                },
                { status: 400 }
            );
        }

        const existingService =
            await prisma.service.findUnique({
                where: {
                    id: serviceId,
                },
                select: {
                    id: true,
                },
            });

        if (!existingService) {
            return Response.json(
                { error: "Service not found" },
                { status: 404 }
            );
        }

        const service =
            await prisma.service.update({
                where: {
                    id: serviceId,
                },
                data: {
                    nameEs: nameEs.trim(),
                    nameEn: nameEn.trim(),
                    category:
                        category.trim(),
                    price,
                    estimatedDuration,
                    requiresApproval,
                    active,
                },
            });

        return Response.json(service);
    } catch (error) {
        console.error(
            "Failed to update service:",
            error
        );

        return Response.json(
            {
                error:
                    "Unable to update service",
            },
            { status: 500 }
        );
    }
}