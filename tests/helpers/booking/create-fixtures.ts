
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";
import {
    validateBookingFixtureManifest,
} from "./fixture-manifest";

// Development-only fixture creation.
// Do not run until cleanup safeguards are reviewed.
async function main() {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-booking-${randomUUID()}`;
    const serviceDate = "2099-01-05";
    const date = new Date(`${serviceDate}T00:00:00.000Z`);

    const directory = ".teff-test-fixtures";
    const manifestPath = `${directory}/booking-${marker}.json`;

    await mkdir(directory, { recursive: true });

    // Reserve a unique manifest before database writes.
    // An interrupted operation leaves a visible PENDING marker.
    await writeFile(manifestPath, "PENDING", {
        mode: 0o600,
        flag: "wx",
    });

    try {
        const manifest = await prisma.$transaction(
            async (tx) => {
                const blockingCustomer = await tx.customer.create({
                    data: {
                        name: `${marker}-blocking`,
                    },
                });

                const employeeA = await tx.employee.create({
                    data: {
                        name: `${marker}-A`,
                        active: true,
                        isBookable: true,
                    },
                });

                const employeeB = await tx.employee.create({
                    data: {
                        name: `${marker}-B`,
                        active: true,
                        isBookable: true,
                    },
                });

                const manicure = await tx.service.create({
                    data: {
                        nameEs: `${marker}-Manicura`,
                        nameEn: "Test Manicure",
                        category: "NAILS",
                        price: 60000,
                        estimatedDuration: 60,
                        active: true,
                    },
                });

                const pedicure = await tx.service.create({
                    data: {
                        nameEs: `${marker}-Pedicura`,
                        nameEn: "Test Pedicure",
                        category: "NAILS",
                        price: 60000,
                        estimatedDuration: 60,
                        active: true,
                    },
                });

                const addon = await tx.addon.create({
                    data: {
                        nameEs: `${marker}-Complemento`,
                        nameEn: "Test Add-on",
                        price: 10000,
                        estimatedDuration: 30,
                        active: true,
                    },
                });

                await tx.employeeService.createMany({
                    data: [employeeA, employeeB].flatMap(
                        (employee) =>
                            [manicure, pedicure].map((service) => ({
                                employeeId: employee.id,
                                serviceId: service.id,
                            }))
                    ),
                });

                await tx.serviceAddon.create({
                    data: {
                        serviceId: manicure.id,
                        addonId: addon.id,
                    },
                });

                // Technician A is unavailable for the pedicure.
                const blockingAppointment = await tx.appointment.create({
                    data: {
                        customerId: blockingCustomer.id,
                        employeeId: employeeA.id,
                        date,
                        startTime: "11:30",
                        duration: 60,
                        status: "BOOKED",
                    },
                });

                // Return the ownership manifest from the transaction.
                // Do not publish it before the database commits.
                return validateBookingFixtureManifest({
                    marker,
                    serviceDate,
                    employeeIds: [employeeA.id, employeeB.id],
                    serviceIds: [manicure.id, pedicure.id],
                    addonId: addon.id,
                    blockingCustomerId: blockingCustomer.id,
                    blockingAppointmentId: blockingAppointment.id,
                    bookingCustomerIds: [],
                    bookingIds: [],
                    appointmentIds: [],
                });
            },
            {
                maxWait: 10000,
                timeout: 20000,
            }
        );

        // The database transaction has committed successfully.
        // Publish the manifest using an atomic filesystem rename.
        const temporaryManifestPath = `${manifestPath}.tmp`;

        await writeFile(
            temporaryManifestPath,
            JSON.stringify(manifest, null, 2),
            {
                mode: 0o600,
                flag: "wx",
            }
        );

        await rename(temporaryManifestPath, manifestPath);

        console.log("Booking fixtures created.");
        console.log(`Manifest: ${manifestPath}`);
        console.log("Database: Approved Neon Development");
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("Booking fixture creation failed:", error);
    console.error(
        "Inspect any PENDING or incomplete manifest before retrying."
    );
    process.exitCode = 1;
});