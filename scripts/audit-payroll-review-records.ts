
import { prisma } from "../src/lib/prisma";

async function main() {
    const start = new Date("2026-09-14T00:00:00.000Z");
    const end = new Date("2026-09-21T00:00:00.000Z");

    const period = await prisma.payrollPeriod.findUnique({
        where: { startDate: start },
        include: {
            entries: {
                select: {
                    id: true,
                    employeeId: true,
                    status: true,
                    employee: {
                        select: { name: true },
                    },
                },
            },
        },
    });

    if (!period) {
        throw new Error("Payroll period not found");
    }

    const commissions = await prisma.commission.findMany({
        where: {
            sale: {
                saleAppointments: {
                    some: {
                        appointment: {
                            date: {
                                gte: start,
                                lt: end,
                            },
                        },
                    },
                },
            },
        },
        select: {
            id: true,
            employeeId: true,
            commissionAmount: true,
            status: true,
            payrollEntryId: true,
        },
    });

    const tips = await prisma.tip.findMany({
        where: {
            sale: {
                saleAppointments: {
                    some: {
                        appointment: {
                            date: {
                                gte: start,
                                lt: end,
                            },
                        },
                    },
                },
            },
        },
        select: {
            id: true,
            employeeId: true,
            amount: true,
            status: true,
            payrollEntryId: true,
        },
    });

    console.log("Period:", {
        id: period.id,
        status: period.status,
    });

    console.log("\nPayroll entries:");
    console.table(period.entries.map((entry) => ({
        id: entry.id,
        employee: entry.employee.name,
        employeeId: entry.employeeId,
        status: entry.status,
    })));

    console.log("\nCommissions:");
    console.table(commissions);

    console.log("\nTips:");
    console.table(tips);
}

main()
    .catch((error) => {
        console.error("Audit failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });