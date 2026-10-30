
import { readFile } from "node:fs/promises";
import { PrismaClient, Prisma } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";
import { validateBookingFixtureManifest } from "./fixture-manifest";

async function main() {
    const manifestPath = process.argv[2];
    const mode = process.argv[3];
    const deleteConfirmation = process.argv[4];

    if (
        mode === "--delete" &&
        deleteConfirmation !== "CONFIRM_BOOKING_FIXTURE_DELETE"
    ) {
        throw new Error(
            "STOP: Explicit booking fixture deletion confirmation required."
        );
    }

    if (
        (
            mode === "--dry-run"
                ? process.argv.length !== 4
                : process.argv.length !== 5
        ) ||
        !manifestPath ||
        !/^\.teff-test-fixtures\/booking-teff-booking-[0-9a-f-]{36}\.json$/.test(manifestPath) ||
        !["--dry-run", "--delete"].includes(mode)
    ) {
        throw new Error("Invalid cleanup arguments.");
    }

    const fixture = validateBookingFixtureManifest(
        JSON.parse(await readFile(manifestPath, "utf8"))
    );

    if (
        manifestPath !==
        `.teff-test-fixtures/booking-${fixture.marker}.json`
    ) {
        throw new Error("Manifest path and marker do not match.");
    }

    const connectionString = getSafeTestDatabaseUrl();
    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    const date = new Date(`${fixture.serviceDate}T00:00:00.000Z`);
    const employeeIds = fixture.employeeIds;
    const serviceIds = fixture.serviceIds;

    try {
        await prisma.$transaction(async (tx) => {
            const employees = await tx.employee.findMany({
                where: { id: { in: employeeIds } },
            });

            const services = await tx.service.findMany({
                where: { id: { in: serviceIds } },
            });

            const addon = await tx.addon.findUnique({
                where: { id: fixture.addonId },
            });

            const blockingCustomer = await tx.customer.findUnique({
                where: { id: fixture.blockingCustomerId },
            });

            if (
                employees.length !== 2 ||
                !employees.every((e) =>
                    [`${fixture.marker}-A`, `${fixture.marker}-B`]
                        .includes(e.name)
                ) ||
                services.length !== 2 ||
                !services.every((s) =>
                    [`${fixture.marker}-Manicura`,
                     `${fixture.marker}-Pedicura`].includes(s.nameEs)
                ) ||
                addon?.nameEs !== `${fixture.marker}-Complemento` ||
                blockingCustomer?.name !== `${fixture.marker}-blocking`
            ) {
                throw new Error("STOP: Fixture ownership mismatch.");
            }

            // Discover test customers even if an HTTP request completed
            // before its IDs were saved in the manifest.
            const customers = await tx.customer.findMany({
                where: {
                    name: { startsWith: `${fixture.marker}-` },
                },
            });

            const customerIds = customers.map((c) => c.id);

            const bookings = await tx.booking.findMany({
                where: {
                    OR: [
                        { notes: fixture.marker },
                        { customerId: { in: customerIds } },
                    ],
                },
            });

            if (
                bookings.some((b) =>
                    b.notes !== fixture.marker ||
                    !customerIds.includes(b.customerId) ||
                    b.date.getTime() !== date.getTime()
                )
            ) {
                throw new Error("STOP: Unexpected booking ownership.");
            }

            const bookingIds = bookings.map((b) => b.id);

            const appointments = await tx.appointment.findMany({
                where: {
                    OR: [
                        { customerId: { in: customerIds } },
                        { employeeId: { in: employeeIds } },
                        { bookingId: { in: bookingIds } },
                    ],
                },
            });

            const appointmentIds = appointments.map((a) => a.id);

            if (
                !appointments.some((a) =>
                    a.id === fixture.blockingAppointmentId &&
                    a.customerId === fixture.blockingCustomerId &&
                    a.employeeId === employeeIds[0] &&
                    a.bookingId === null &&
                    a.date.getTime() === date.getTime() &&
                    a.startTime === "11:30" &&
                    a.duration === 60 &&
                    a.status === "BOOKED"
                ) ||
                appointments.some((a) =>
                    a.date.getTime() !== date.getTime() ||
                    !customerIds.includes(a.customerId) ||
                    !employeeIds.includes(a.employeeId) ||
                    (
                        a.id !== fixture.blockingAppointmentId &&
                        (
                            a.bookingId === null ||
                            !bookingIds.includes(a.bookingId)
                        )
                    )
                )
            ) {
                throw new Error("STOP: Unexpected appointment ownership.");
            }

            // Previously recorded IDs must still belong to this fixture.
            if (
                !fixture.bookingIds.every((id) => bookingIds.includes(id)) ||
                !fixture.appointmentIds.every((id) => appointmentIds.includes(id)) ||
                !fixture.bookingCustomerIds.every((id) => customerIds.includes(id))
            ) {
                throw new Error("STOP: Manifest IDs do not match database.");
            }

            const [
                saleLinks,
                saleLines,
                commissions,
                tips,
                payrollEntries,
                linkedUsers,
                scheduleBlocks,
                serviceUses,
                addonUses,
            ] = await Promise.all([
                tx.saleAppointment.count({
                    where: { appointmentId: { in: appointmentIds } },
                }),
                tx.saleLineItem.count({
                    where: {
                        OR: [
                            { appointmentId: { in: appointmentIds } },
                            { employeeId: { in: employeeIds } },
                        ],
                    },
                }),
                tx.commission.count({
                    where: { employeeId: { in: employeeIds } },
                }),
                tx.tip.count({
                    where: { employeeId: { in: employeeIds } },
                }),
                tx.payrollEntry.count({
                    where: { employeeId: { in: employeeIds } },
                }),
                tx.user.count({
                    where: { employeeId: { in: employeeIds } },
                }),
                tx.employeeScheduleBlock.count({
                    where: { employeeId: { in: employeeIds } },
                }),
                tx.appointmentService.findMany({
                    where: { serviceId: { in: serviceIds } },
                    select: { appointmentId: true },
                }),
                tx.appointmentAddon.findMany({
                    where: { addonId: fixture.addonId },
                    select: { appointmentId: true },
                }),
            ]);

            if (
                saleLinks || saleLines || commissions || tips ||
                payrollEntries || linkedUsers || scheduleBlocks ||
                serviceUses.some((s) => !appointmentIds.includes(s.appointmentId)) ||
                addonUses.some((a) => !appointmentIds.includes(a.appointmentId))
            ) {
                throw new Error(
                    "STOP: Financial or external references detected."
                );
            }

            // Verify every technician qualification belongs to
            // this fixture before allowing any deletion.
            const qualifications = await tx.employeeService.findMany({
                where: {
                    OR: [
                        { employeeId: { in: employeeIds } },
                        { serviceId: { in: serviceIds } },
                    ],
                },
                select: {
                    employeeId: true,
                    serviceId: true,
                },
            });

            const expectedQualifications = new Set(
                employeeIds.flatMap((employeeId) =>
                    serviceIds.map(
                        (serviceId) => `${employeeId}:${serviceId}`
                    )
                )
            );

            if (
                qualifications.length !== 4 ||
                qualifications.some(
                    (item) =>
                        !expectedQualifications.has(
                            `${item.employeeId}:${item.serviceId}`
                        )
                )
            ) {
                throw new Error(
                    "STOP: Unexpected technician qualifications."
                );
            }

            // The fixture creates exactly one service/add-on
            // relationship: manicure + test complement.
            const addonRelations = await tx.serviceAddon.findMany({
                where: {
                    OR: [
                        { serviceId: { in: serviceIds } },
                        { addonId: fixture.addonId },
                    ],
                },
                select: {
                    serviceId: true,
                    addonId: true,
                },
            });

            if (
                addonRelations.length !== 1 ||
                addonRelations[0].serviceId !== serviceIds[0] ||
                addonRelations[0].addonId !== fixture.addonId
            ) {
                throw new Error(
                    "STOP: Unexpected service/add-on relationships."
                );
            }

            console.log("Verified fixture:", fixture.marker);
            console.table({
                customers: customerIds.length,
                bookings: bookingIds.length,
                appointments: appointmentIds.length,
                technicians: employees.length,
                services: services.length,
                addons: 1,
            });

            if (mode === "--dry-run") {
                console.log("DRY RUN: No records deleted.");
                return;
            }

            await tx.appointmentAddon.deleteMany({
                where: { appointmentId: { in: appointmentIds } },
            });
            await tx.appointmentService.deleteMany({
                where: { appointmentId: { in: appointmentIds } },
            });
            await tx.appointment.deleteMany({
                where: { id: { in: appointmentIds } },
            });
            await tx.booking.deleteMany({
                where: { id: { in: bookingIds } },
            });
            await tx.customer.deleteMany({
                where: { id: { in: customerIds } },
            });
            const deletedAddonRelations = await tx.serviceAddon.deleteMany({
                where: {
                    serviceId: serviceIds[0],
                    addonId: fixture.addonId,
                },
            });

            if (deletedAddonRelations.count !== 1) {
                throw new Error("STOP: Add-on relationship deletion mismatch.");
            }
            const deletedQualifications = await tx.employeeService.deleteMany({
                where: {
                    employeeId: { in: employeeIds },
                    serviceId: { in: serviceIds },
                },
            });

            if (deletedQualifications.count !== 4) {
                throw new Error("STOP: Qualification deletion mismatch.");
            }
            await tx.addon.delete({ where: { id: fixture.addonId } });
            await tx.service.deleteMany({
                where: { id: { in: serviceIds } },
            });
            await tx.employee.deleteMany({
                where: { id: { in: employeeIds } },
            });

            console.log("Fixture cleanup transaction completed.");
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 30000,
        });
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});