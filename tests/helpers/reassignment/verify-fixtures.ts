
import { readFile } from "node:fs/promises";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";

type FixtureManifest = {
    marker: string;
    ownerId: number;
    customerId: number;
    serviceId: number;
    employeeAId: number;
    employeeBId: number;
    unsoldAppointmentId: number;
    soldAppointmentId: number;
    saleId: number;
    commissionId: number;
    tipId: number;
};

async function main() {
    const manifestPath = process.argv[2];

    if (!manifestPath) {
        throw new Error("Fixture manifest path is required");
    }

    const fixture: FixtureManifest = JSON.parse(
        await readFile(manifestPath, "utf8")
    );

    if (!/^teff-reassignment-[0-9a-f-]{36}$/.test(fixture.marker)) {
        throw new Error("Invalid fixture marker");
    }

    // Verify the approved development database before connecting.
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    try {
        const [
            owner,
            customer,
            service,
            employees,
            appointments,
            sale,
            commission,
            tip,
        ] = await Promise.all([
            prisma.user.findUnique({
                where: { id: fixture.ownerId },
            }),
            prisma.customer.findUnique({
                where: { id: fixture.customerId },
            }),
            prisma.service.findUnique({
                where: { id: fixture.serviceId },
            }),
            prisma.employee.findMany({
                where: {
                    id: {
                        in: [fixture.employeeAId, fixture.employeeBId],
                    },
                },
            }),
            prisma.appointment.findMany({
                where: {
                    id: {
                        in: [
                            fixture.unsoldAppointmentId,
                            fixture.soldAppointmentId,
                        ],
                    },
                },
            }),
            prisma.sale.findUnique({
                where: { id: fixture.saleId },
                include: { saleAppointments: true },
            }),
            prisma.commission.findUnique({
                where: { id: fixture.commissionId },
            }),
            prisma.tip.findUnique({
                where: { id: fixture.tipId },
            }),
        ]);

        const records = [
            owner,
            customer,
            service,
            sale,
            commission,
            tip,
        ];

        const allMissing =
            records.every((record) => record === null) &&
            employees.length === 0 &&
            appointments.length === 0;

        if (allMissing) {
            console.log("Fixture state: NOT COMMITTED");
            console.log("No matching fixture IDs were found.");
            return;
        }

        const valid =
            owner?.name === fixture.marker &&
            customer?.name === fixture.marker &&
            service?.nameEs === fixture.marker &&
            service.category === "TEST" &&
            employees.length === 2 &&
            appointments.length === 2 &&
            appointments.every(
                (appointment) =>
                    appointment.customerId === fixture.customerId &&
                    [fixture.employeeAId, fixture.employeeBId].includes(
                        appointment.employeeId
                    )
            ) &&
            sale?.saleAppointments.length === 1 &&
            sale.saleAppointments[0].appointmentId ===
                fixture.soldAppointmentId &&
            commission?.saleId === fixture.saleId &&
            tip?.saleId === fixture.saleId;

        if (!valid) {
            throw new Error(
                "Fixture state: INCOMPLETE OR UNEXPECTED. Do not run cleanup."
            );
        }

        console.log("Fixture state: COMMITTED");
        console.log("Fixture ownership: VERIFIED");
        console.log("Safe to proceed with controlled API testing.");
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});