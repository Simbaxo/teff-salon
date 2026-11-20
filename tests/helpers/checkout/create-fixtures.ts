
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";

// Create isolated checkout fixtures on Neon Development only.
async function main() {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-checkout-${randomUUID()}`;
    const email = `${marker}@example.invalid`;
    const password = randomUUID() + randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    const manifestDirectory = ".teff-test-fixtures";
    const manifestPath =
        `${manifestDirectory}/checkout-${marker}.json`;

    await mkdir(manifestDirectory, { recursive: true });

    try {
        // Reserve the manifest before creating database records.
        // A failed transaction leaves no committed fixture records.
        await writeFile(manifestPath, "PENDING", {
            mode: 0o600,
            flag: "wx",
        });

        try {
            const fixture = await prisma.$transaction(
                async (tx) => {
                    const owner = await tx.user.create({
                        data: {
                            name: marker,
                            email,
                            passwordHash,
                            role: "OWNER",
                            active: true,
                        },
                    });

                    const customer = await tx.customer.create({
                        data: { name: marker },
                    });

                    const serviceA = await tx.service.create({
                        data: {
                            nameEs: `${marker}-Manicure`,
                            nameEn: "Manicure",
                            category: "TEST",
                            price: 60000,
                            estimatedDuration: 60,
                        },
                    });

                    const serviceB = await tx.service.create({
                        data: {
                            nameEs: `${marker}-Pedicure`,
                            nameEn: "Pedicure",
                            category: "TEST",
                            price: 60000,
                            estimatedDuration: 60,
                        },
                    });

                    const addon = await tx.addon.create({
                        data: {
                            nameEs: `${marker}-Retiro`,
                            nameEn: "Removal",
                            price: 15000,
                            estimatedDuration: 15,
                        },
                    });

                    const employeeA = await tx.employee.create({
                        data: {
                            name: `${marker}-A`,
                            active: true,
                        },
                    });

                    const employeeB = await tx.employee.create({
                        data: {
                            name: `${marker}-B`,
                            active: true,
                        },
                    });

                    await tx.employeeService.createMany({
                        data: [
                            {
                                employeeId: employeeA.id,
                                serviceId: serviceA.id,
                            },
                            {
                                employeeId: employeeB.id,
                                serviceId: serviceB.id,
                            },
                        ],
                    });

                    await tx.serviceAddon.create({
                        data: {
                            serviceId: serviceA.id,
                            addonId: addon.id,
                        },
                    });

                    const serviceDate =
                        new Date("2099-01-05T00:00:00.000Z");

                    const booking = await tx.booking.create({
                        data: {
                            customerId: customer.id,
                            date: serviceDate,
                        },
                    });

                    const appointmentA = await tx.appointment.create({
                        data: {
                            customerId: customer.id,
                            bookingId: booking.id,
                            employeeId: employeeA.id,
                            date: serviceDate,
                            startTime: "10:00",
                            duration: 60,
                            status: "IN_PROGRESS",
                            appointmentServices: {
                                create: {
                                    serviceId: serviceA.id,
                                    bookedPrice: 60000,
                                    bookedDuration: 60,
                                },
                            },
                        },
                    });

                    const appointmentB = await tx.appointment.create({
                        data: {
                            customerId: customer.id,
                            bookingId: booking.id,
                            employeeId: employeeB.id,
                            date: serviceDate,
                            startTime: "11:00",
                            duration: 60,
                            status: "IN_PROGRESS",
                            appointmentServices: {
                                create: {
                                    serviceId: serviceB.id,
                                    bookedPrice: 60000,
                                    bookedDuration: 60,
                                },
                            },
                        },
                    });

                    const manifest = {
                        marker,
                        ownerId: owner.id,
                        customerId: customer.id,
                        bookingId: booking.id,
                        employeeIds: [
                            employeeA.id,
                            employeeB.id,
                        ],
                        serviceIds: [
                            serviceA.id,
                            serviceB.id,
                        ],
                        addonId: addon.id,
                        appointmentIds: [
                            appointmentA.id,
                            appointmentB.id,
                        ],
                    };

                    // Save the IDs before the transaction can commit.
                    // If writing fails, Prisma rolls back the transaction.
                    await writeFile(
                        manifestPath,
                        JSON.stringify(manifest, null, 2),
                        { mode: 0o600 }
                    );

                    return manifest;
                },
                {
                    maxWait: 10000,
                    timeout: 20000,
                }
            );

            console.log("Checkout fixtures created.");
            console.log("Manifest:", manifestPath);
            console.log("Test OWNER email:", email);
            console.log("Test OWNER password:", password);
            console.log("Keep these credentials private.");
        } catch (error) {
            // Keep the manifest if records may have committed.
            // This allows safe investigation and recovery.
            console.error(
                "Fixture creation failed. Inspect manifest before retrying:",
                manifestPath
            );
            throw error;
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("Checkout fixture creation failed:", error);
    process.exitCode = 1;
});