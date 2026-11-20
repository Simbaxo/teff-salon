
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";

type FixtureIds = {
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
    const connectionString = getSafeTestDatabaseUrl();

    const manifestPath = process.argv[2];

    if (!manifestPath) {
        throw new Error("Fixture manifest path is required");
    }

    const { readFile } = await import("node:fs/promises");

    const fixture: FixtureIds = JSON.parse(
        await readFile(manifestPath, "utf8")
    );

    if (!fixture.marker.startsWith("teff-reassignment-")) {
        throw new Error("Invalid fixture marker");
    }

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    try {
        await prisma.$transaction(async (tx) => {
            // Confirm the fixture owns the records being deleted.
            const customer = await tx.customer.findUnique({
                where: { id: fixture.customerId },
            });

            const owner = await tx.user.findUnique({
                where: { id: fixture.ownerId },
            });

            if (
                customer?.name !== fixture.marker ||
                owner?.name !== fixture.marker
            ) {
                throw new Error("Fixture ownership verification failed");
            }

            // Verify every record belongs to this exact test run.
            const [service, employees, appointments, sale, commission, tip] =
                await Promise.all([
                    tx.service.findUnique({
                        where: { id: fixture.serviceId },
                    }),
                    tx.employee.findMany({
                        where: {
                            id: {
                                in: [fixture.employeeAId, fixture.employeeBId],
                            },
                        },
                    }),
                    tx.appointment.findMany({
                        where: {
                            id: {
                                in: [
                                    fixture.unsoldAppointmentId,
                                    fixture.soldAppointmentId,
                                ],
                            },
                        },
                    }),
                    tx.sale.findUnique({
                        where: { id: fixture.saleId },
                        include: {
                            saleAppointments: true,
                        },
                    }),
                    tx.commission.findUnique({
                        where: { id: fixture.commissionId },
                    }),
                    tx.tip.findUnique({
                        where: { id: fixture.tipId },
                    }),
                ]);

            const employeeIds = [
                fixture.employeeAId,
                fixture.employeeBId,
            ];

            const appointmentIds = [
                fixture.unsoldAppointmentId,
                fixture.soldAppointmentId,
            ];

            if (
                new Set(employeeIds).size !== 2 ||
                new Set(appointmentIds).size !== 2 ||
                !service ||
                service.nameEs !== fixture.marker ||
                service.category !== "TEST" ||
                employees.length !== 2 ||
                !employees.every(
                    (employee) =>
                        employeeIds.includes(employee.id) &&
                        employee.name ===
                            `${fixture.marker}-${
                                employee.id === fixture.employeeAId ? "A" : "B"
                            }`
                ) ||
                appointments.length !== 2 ||
                !appointments.every((appointment) => {
                    const isUnsold =
                        appointment.id === fixture.unsoldAppointmentId;

                    const validEmployee = isUnsold
                        ? [
                              fixture.employeeAId,
                              fixture.employeeBId,
                          ].includes(appointment.employeeId)
                        : appointment.employeeId === fixture.employeeAId;

                    return (
                        appointmentIds.includes(appointment.id) &&
                        appointment.customerId === fixture.customerId &&
                        appointment.bookingId === null &&
                        validEmployee
                    );
                }) ||
                !sale ||
                sale.saleAppointments.length !== 1 ||
                sale.saleAppointments[0].appointmentId !==
                    fixture.soldAppointmentId ||
                commission?.saleId !== fixture.saleId ||
                commission.employeeId !== fixture.employeeAId ||
                tip?.saleId !== fixture.saleId ||
                tip.employeeId !== fixture.employeeAId
            ) {
                throw new Error(
                    "Fixture ownership verification failed"
                );
            }

            // Both test appointments must contain exactly one
            // service: the service created for this test run.
            const appointmentServices =
                await tx.appointmentService.findMany({
                    where: {
                        appointmentId: {
                            in: appointmentIds,
                        },
                    },
                    select: {
                        appointmentId: true,
                        serviceId: true,
                    },
                });

            const validAppointmentServices =
                appointmentServices.length === 2 &&
                appointmentIds.every(
                    (appointmentId) =>
                        appointmentServices.filter(
                            (item) =>
                                item.appointmentId === appointmentId &&
                                item.serviceId === fixture.serviceId
                        ).length === 1
                );

            if (!validAppointmentServices) {
                throw new Error(
                    "Unexpected appointment services. Cleanup stopped."
                );
            }

            // Refuse cleanup if tests created unexpected dependent records.
            const [
                addonCount,
                lineItemCount,
                paymentCount,
                extraCommissionCount,
                extraTipCount,
                payrollEntryCount,
                manualPaymentCount,
                unexpectedSaleLinks,
            ] = await Promise.all([
                tx.appointmentAddon.count({
                    where: { appointmentId: { in: appointmentIds } },
                }),
                tx.saleLineItem.count({
                    where: { saleId: fixture.saleId },
                }),
                tx.payment.count({
                    where: { saleId: fixture.saleId },
                }),
                tx.commission.count({
                    where: {
                        saleId: fixture.saleId,
                        id: { not: fixture.commissionId },
                    },
                }),
                tx.tip.count({
                    where: {
                        saleId: fixture.saleId,
                        id: { not: fixture.tipId },
                    },
                }),
                tx.payrollEntry.count({
                    where: { employeeId: { in: employeeIds } },
                }),
                tx.payrollManualPayment.count({
                    where: { recordedByUserId: fixture.ownerId },
                }),
                tx.saleAppointment.count({
                    where: {
                        appointmentId: { in: appointmentIds },
                        NOT: {
                            saleId: fixture.saleId,
                            appointmentId: fixture.soldAppointmentId,
                        },
                    },
                }),
            ]);

            if (
                addonCount !== 0 ||
                lineItemCount !== 0 ||
                paymentCount !== 0 ||
                extraCommissionCount !== 0 ||
                extraTipCount !== 0 ||
                payrollEntryCount !== 0 ||
                manualPaymentCount !== 0 ||
                unexpectedSaleLinks !== 0 ||
                commission?.payrollEntryId !== null ||
                tip?.payrollEntryId !== null
            ) {
                throw new Error(
                    "Unexpected dependent records. Cleanup stopped."
                );
            }

            // Remove financial records before their parent sale.
            await tx.tip.delete({
                where: { id: fixture.tipId },
            });

            await tx.commission.delete({
                where: { id: fixture.commissionId },
            });

            await tx.saleAppointment.delete({
                where: {
                    saleId_appointmentId: {
                        saleId: fixture.saleId,
                        appointmentId: fixture.soldAppointmentId,
                    },
                },
            });

            await tx.sale.delete({
                where: { id: fixture.saleId },
            });

            // Remove appointment services before appointments.
            await tx.appointmentService.deleteMany({
                where: {
                    appointmentId: {
                        in: [
                            fixture.unsoldAppointmentId,
                            fixture.soldAppointmentId,
                        ],
                    },
                },
            });

            await tx.appointment.deleteMany({
                where: {
                    id: {
                        in: [
                            fixture.unsoldAppointmentId,
                            fixture.soldAppointmentId,
                        ],
                    },
                },
            });

            await tx.employeeService.deleteMany({
                where: {
                    serviceId: fixture.serviceId,
                    employeeId: {
                        in: [
                            fixture.employeeAId,
                            fixture.employeeBId,
                        ],
                    },
                },
            });

            await tx.service.delete({
                where: { id: fixture.serviceId },
            });

            await tx.employee.deleteMany({
                where: {
                    id: {
                        in: [
                            fixture.employeeAId,
                            fixture.employeeBId,
                        ],
                    },
                },
            });

            await tx.customer.delete({
                where: { id: fixture.customerId },
            });

            await tx.user.delete({
                where: { id: fixture.ownerId },
            });
        });

        console.log("TEFF reassignment fixtures cleaned up.");
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("Fixture cleanup failed:", error);
    process.exitCode = 1;
});