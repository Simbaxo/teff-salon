import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    // Public booking availability only needs the blocked time range.
    // Never expose the internal operational reason publicly.
    if (mode === "availability") {
        try {
            const blocks =
                await prisma.employeeScheduleBlock.findMany({
                    select: {
                        id: true,
                        employeeId: true,
                        date: true,
                        startTime: true,
                        endTime: true,
                    },
                    orderBy: [
                        {
                            date: "asc",
                        },
                        {
                            startTime: "asc",
                        },
                    ],
                });

            return Response.json(blocks);
        } catch (error) {
            console.error(
                "Failed to load schedule-block availability:",
                error
            );

            return Response.json(
                {
                    error:
                        "Unable to load schedule-block availability",
                },
                { status: 500 }
            );
        }
    }
    
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
        const blocks =
            await prisma.employeeScheduleBlock.findMany({
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
                orderBy: [
                    {
                        date: "asc",
                    },
                    {
                        startTime: "asc",
                    },
                ],
            });

        return Response.json(blocks);
    } catch (error) {
        console.error(
            "Failed to load schedule blocks:",
            error
        );

        return Response.json(
            { error: "Unable to load schedule blocks" },
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
            employeeId,
            date,
            startTime,
            endTime,
            reason,
        } = body;

        if (
            !Number.isInteger(employeeId) ||
            employeeId <= 0 ||
            typeof date !== "string" ||
            typeof startTime !== "string" ||
            typeof endTime !== "string" ||
            (reason !== undefined &&
                reason !== null &&
                typeof reason !== "string")
        ) {
            return Response.json(
                { error: "Invalid schedule block information" },
                { status: 400 }
            );
        }

        // Validate the calendar date.
        const dateMatch =
            /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

        let isValidDate = false;

        if (dateMatch) {
            const year = Number(dateMatch[1]);
            const month = Number(dateMatch[2]);
            const day = Number(dateMatch[3]);

            const parsedDate = new Date(
                Date.UTC(year, month - 1, day)
            );

            isValidDate =
                parsedDate.getUTCFullYear() === year &&
                parsedDate.getUTCMonth() === month - 1 &&
                parsedDate.getUTCDate() === day;
        }

        const validStartTime =
            /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);

        const validEndTime =
            /^([01]\d|2[0-3]):[0-5]\d$/.test(endTime);

        if (
            !isValidDate ||
            !validStartTime ||
            !validEndTime ||
            startTime >= endTime
        ) {
            return Response.json(
                { error: "Invalid schedule block date or time" },
                { status: 400 }
            );
        }

        const normalizedReason =
            typeof reason === "string"
                ? reason.trim()
                : "";

        if (normalizedReason.length > 200) {
            return Response.json(
                { error: "Schedule block reason is too long" },
                { status: 400 }
            );
        }

        const employee = await prisma.employee.findFirst({
            where: {
                id: employeeId,
                active: true,
            },
            select: {
                id: true,
            },
        });

        if (!employee) {
            return Response.json(
                { error: "Technician does not exist or is inactive" },
                { status: 400 }
            );
        }

        // Do not create overlapping blocks for the same technician/day.
        const existingBlocks =
            await prisma.employeeScheduleBlock.findMany({
                where: {
                    employeeId,
                    date: new Date(
                        `${date}T00:00:00.000Z`
                    ),
                },
            });

        const hasOverlap = existingBlocks.some(
            (block) =>
                startTime < block.endTime &&
                endTime > block.startTime
        );

        if (hasOverlap) {
            return Response.json(
                {
                    error:
                        "This technician already has an overlapping schedule block",
                },
                { status: 409 }
            );
        }

        const block =
            await prisma.employeeScheduleBlock.create({
                data: {
                    employeeId,
                    date: new Date(
                        `${date}T00:00:00.000Z`
                    ),
                    startTime,
                    endTime,
                    reason: normalizedReason || null,
                },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

        return Response.json(block, { status: 201 });
    } catch (error) {
        console.error(
            "Failed to create schedule block:",
            error
        );

        return Response.json(
            { error: "Unable to create schedule block" },
            { status: 500 }
        );
    }
}