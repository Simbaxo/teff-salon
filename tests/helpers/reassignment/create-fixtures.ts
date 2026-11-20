import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";

// Development-only fixture creation. Never run against production.
async function main() {
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const marker = `teff-reassignment-${randomUUID()}`;
    const email = `${marker}@example.invalid`;
    const password = randomUUID() + randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    // Reserve a unique local manifest path for this test run.
    const manifestDirectory = ".teff-test-fixtures";
    const manifestPath =
        `${manifestDirectory}/reassignment-${marker}.json`;

    await mkdir(manifestDirectory, { recursive: true });

    try {
        const fixture = await prisma.$transaction(async (tx) => {
            const owner = await tx.user.create({
                data: {
                    name: marker,
                    email,
                    passwordHash,
                    role: "OWNER",
                    active: true,
                },
            });

            const service = await tx.service.create({
                data: {
                    nameEs: marker,
                    nameEn: marker,
                    category: "TEST",
                    price: 60000,
                    estimatedDuration: 60,
                },
            });

            const employees = await Promise.all([
                tx.employee.create({
                    data: { name: `${marker}-A`, active: true },
                }),
                tx.employee.create({
                    data: { name: `${marker}-B`, active: true },
                }),
            ]);

            await tx.employeeService.createMany({
                data: employees.map((employee) => ({
                    employeeId: employee.id,
                    serviceId: service.id,
                })),
            });

            const customer = await tx.customer.create({
                data: { name: marker },
            });

            const serviceDate =
                new Date("2099-01-05T00:00:00.000Z");

            const unsoldAppointment = await tx.appointment.create({
                data: {
                    customerId: customer.id,
                    employeeId: employees[0].id,
                    date: serviceDate,
                    startTime: "10:00",
                    duration: 60,
                    status: "BOOKED",
                    appointmentServices: {
                        create: {
                            serviceId: service.id,
                            bookedPrice: 60000,
                            bookedDuration: 60,
                        },
                    },
                },
            });

            const soldAppointment = await tx.appointment.create({
                data: {
                    customerId: customer.id,
                    employeeId: employees[0].id,
                    date: serviceDate,
                    startTime: "12:00",
                    duration: 60,
                    status: "COMPLETED",
                    appointmentServices: {
                        create: {
                            serviceId: service.id,
                            bookedPrice: 60000,
                            bookedDuration: 60,
                        },
                    },
                },
            });

            const sale = await tx.sale.create({
                data: {
                    subtotal: 60000,
                    discountTotal: 0,
                    finalTotal: 60000,
                },
            });

            await tx.saleAppointment.create({
                data: {
                    saleId: sale.id,
                    appointmentId: soldAppointment.id,
                },
            });

            const commission = await tx.commission.create({
                data: {
                    saleId: sale.id,
                    employeeId: employees[0].id,
                    commissionBase: 60000,
                    commissionRate: 50,
                    commissionAmount: 30000,
                },
            });

            const tip = await tx.tip.create({
                data: {
                    saleId: sale.id,
                    employeeId: employees[0].id,
                    amount: 10000,
                    paymentMethod: "TRANSFER",
                },
            });

            // Record exact fixture IDs before committing database changes.
            // Never store the temporary login password in this manifest.
            const manifest = {
                marker,
                ownerId: owner.id,
                customerId: customer.id,
                serviceId: service.id,
                employeeAId: employees[0].id,
                employeeBId: employees[1].id,
                unsoldAppointmentId: unsoldAppointment.id,
                soldAppointmentId: soldAppointment.id,
                saleId: sale.id,
                commissionId: commission.id,
                tipId: tip.id,
            };

            await writeFile(
                manifestPath,
                JSON.stringify(manifest, null, 2),
                { mode: 0o600, flag: "wx" }
            );

            return manifest;
        });

        console.log("TEFF reassignment fixtures created.");
        console.log("Cleanup manifest:", manifestPath);
        console.log("Test OWNER email:", email);
        console.log("Test OWNER password:", password);
        console.log("Do not share or commit these credentials.");

    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("Fixture creation failed:", error);
    process.exitCode = 1;
});