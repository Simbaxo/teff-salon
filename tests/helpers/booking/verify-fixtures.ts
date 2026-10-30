
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { validateBookingFixtureManifest } from "./fixture-manifest";

async function main() {
    const manifestPath = process.argv[2];

    if (
        !manifestPath ||
        !/^\.teff-test-fixtures\/booking-teff-booking-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/.test(manifestPath)
    ) {
        throw new Error("STOP: Invalid manifest path.");
    }

    if (process.env.NODE_ENV !== "test") {
        throw new Error("STOP: NODE_ENV must be test.");
    }

    const url = process.env.TEST_DATABASE_URL;

    if (!url) {
        throw new Error("STOP: Missing TEST_DATABASE_URL.");
    }

    const endpoint = new URL(url).hostname
        .replace(/-pooler(?=\.)/, "");

    if (
        endpoint !==
        "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech"
    ) {
        throw new Error("STOP: Unauthorized database.");
    }

    const fixture = validateBookingFixtureManifest(
        JSON.parse(await readFile(manifestPath, "utf8"))
    );

    if (manifestPath !==
        `.teff-test-fixtures/booking-${fixture.marker}.json`
    ) {
        throw new Error("STOP: Manifest marker mismatch.");
    }

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url }),
    });

    try {
        const [employees, services, addon, customer, appointment] =
            await Promise.all([
                prisma.employee.findMany({
                    where: { id: { in: fixture.employeeIds } },
                }),
                prisma.service.findMany({
                    where: { id: { in: fixture.serviceIds } },
                }),
                prisma.addon.findUnique({
                    where: { id: fixture.addonId },
                }),
                prisma.customer.findUnique({
                    where: { id: fixture.blockingCustomerId },
                }),
                prisma.appointment.findUnique({
                    where: { id: fixture.blockingAppointmentId },
                }),
            ]);

        if (
            employees.length !== 2 ||
            !employees.every((e) =>
                e.name.startsWith(`${fixture.marker}-`)
            ) ||
            services.length !== 2 ||
            !services.every((s) =>
                s.nameEs.startsWith(`${fixture.marker}-`) &&
                s.category === "NAILS"
            ) ||
            addon?.nameEs !== `${fixture.marker}-Complemento` ||
            customer?.name !== `${fixture.marker}-blocking` ||
            appointment?.customerId !== fixture.blockingCustomerId ||
            !fixture.employeeIds.includes(
                appointment?.employeeId ?? -1
            ) ||
            appointment?.bookingId !== null ||
            appointment.date.toISOString().slice(0, 10) !==
                fixture.serviceDate
        ) {
            throw new Error(
                "STOP: Fixture ownership verification failed."
            );
        }

        console.log("Fixture ownership verified.");
        console.log("Marker:", fixture.marker);
        console.log("Technicians:", employees.length);
        console.log("Services:", services.length);
        console.log("Add-on:", addon.nameEs);
        console.log("Blocking appointment:", appointment.id);
        console.log("READ ONLY — No records changed.");
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});