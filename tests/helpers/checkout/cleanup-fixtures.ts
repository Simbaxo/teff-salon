
import { readFile } from "node:fs/promises";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";
import { lockPayrollWeek } from "../../../src/lib/payroll/period-lock";

type CheckoutFixtureManifest = {
    marker: string;
    ownerId: number;
    customerId: number;
    bookingId: number;
    employeeIds: number[];
    serviceIds: number[];
    addonId: number;
    appointmentIds: number[];
};

// Validate fixture ownership before any cleanup is permitted.
// Actual deletion will be added after the fixture structure is finalized.
async function main() {
    const manifestPath = process.argv[2];

    // Cleanup is read-only unless deletion is explicitly requested.
    const deleteRequested = process.argv[3] === "--delete";
    const dryRunDelete = process.argv[3] === "--dry-run-delete";

    if (
        process.argv.length > 4 ||
        (process.argv[3] !== undefined &&
            !deleteRequested &&
            !dryRunDelete)
    ) {
        throw new Error("Invalid cleanup arguments");
    }

    if (
        !manifestPath ||
        !manifestPath.startsWith(".teff-test-fixtures/checkout-")
    ) {
        throw new Error("Invalid checkout fixture manifest path");
    }

    const fixture: CheckoutFixtureManifest = JSON.parse(
        await readFile(manifestPath, "utf8")
    );

    if (
        !/^teff-checkout-[0-9a-f-]{36}$/.test(fixture.marker) ||
        fixture.employeeIds.length !== 2 ||
        fixture.serviceIds.length !== 2 ||
        fixture.appointmentIds.length !== 2
    ) {
        throw new Error("Invalid checkout fixture manifest");
    }

    // Refuse to connect to any database except Neon Development.
    const connectionString = getSafeTestDatabaseUrl();

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString }),
    });

    try {
        // Keep fixture verification within one database transaction.
        // Cleanup deletion will be added only after safety review.
        await prisma.$transaction(
            async (tx) => {
                // Prevent simultaneous cleanup of this exact fixture.
                await tx.$queryRaw`
                    SELECT pg_advisory_xact_lock(
                        hashtext('teff-checkout-fixture'),
                        hashtext(${fixture.marker})
                    )::text
                `;

                // Match checkout's financial lock for the fixture week.
                // All fixture appointments use this fixed service date.
                const serviceDate =
                    new Date("2099-01-05T00:00:00.000Z");

                const monday = new Date(serviceDate);
                const weekday = monday.getUTCDay();

                monday.setUTCDate(
                    monday.getUTCDate() -
                    (weekday === 0 ? 6 : weekday - 1)
                );

                await lockPayrollWeek(tx, monday);
                const owner = await tx.user.findUnique({
                where: { id: fixture.ownerId },
            });
const customer = await tx.customer.findUnique({
                where: { id: fixture.customerId },
            });
const booking = await tx.booking.findUnique({
                where: { id: fixture.bookingId },
            });;

        if (
            owner?.name !== fixture.marker ||
            customer?.name !== fixture.marker ||
            booking?.customerId !== fixture.customerId
        ) {
            throw new Error(
                "Fixture ownership verification failed. Cleanup stopped."
            );
        }


        // Verify every technician, service, add-on, and appointment
        // belongs to this exact checkout fixture.
        const employees = await tx.employee.findMany({
                    where: { id: { in: fixture.employeeIds } },
                });
const services = await tx.service.findMany({
                    where: { id: { in: fixture.serviceIds } },
                });
const addon = await tx.addon.findUnique({
                    where: { id: fixture.addonId },
                });
const appointments = await tx.appointment.findMany({
                    where: { id: { in: fixture.appointmentIds } },
                });;

        const validEmployees =
            new Set(fixture.employeeIds).size === 2 &&
            employees.length === 2 &&
            employees.every(
                (employee) =>
                    employee.name.startsWith(fixture.marker + "-")
            );

        const validServices =
            new Set(fixture.serviceIds).size === 2 &&
            services.length === 2 &&
            services.every(
                (service) =>
                    service.nameEs.startsWith(fixture.marker + "-") &&
                    service.category === "TEST"
            );

        const validAddon =
            addon?.nameEs === `${fixture.marker}-Retiro`;

        const validAppointments =
            new Set(fixture.appointmentIds).size === 2 &&
            appointments.length === 2 &&
            appointments.every(
                (appointment) =>
                    appointment.customerId === fixture.customerId &&
                    appointment.bookingId === fixture.bookingId &&
                    fixture.employeeIds.includes(appointment.employeeId)
            );

        if (
            !validEmployees ||
            !validServices ||
            !validAddon ||
            !validAppointments
        ) {
            throw new Error(
                "Fixture record ownership mismatch. Cleanup stopped."
            );
        }


        // Never clean up fixtures that have entered payroll.
        const payrollEntryCount = await tx.payrollEntry.count({
                where: {
                    employeeId: {
                        in: fixture.employeeIds,
                    },
                },
            });
const linkedCommissionCount = await tx.commission.count({
                where: {
                    employeeId: {
                        in: fixture.employeeIds,
                    },
                    payrollEntryId: {
                        not: null,
                    },
                },
            });
const linkedTipCount = await tx.tip.count({
                where: {
                    employeeId: {
                        in: fixture.employeeIds,
                    },
                    payrollEntryId: {
                        not: null,
                    },
                },
            });
const manualPaymentCount = await tx.payrollManualPayment.count({
                where: {
                    recordedByUserId: fixture.ownerId,
                },
            });;

        if (
            payrollEntryCount !== 0 ||
            linkedCommissionCount !== 0 ||
            linkedTipCount !== 0 ||
            manualPaymentCount !== 0
        ) {
            throw new Error(
                "Fixture has payroll dependencies. Cleanup stopped."
            );
        }

        // Refuse cleanup if other appointments use fixture records.
        const customerAppointments = await tx.appointment.findMany({
                where: { customerId: fixture.customerId },
                select: { id: true },
            });
const bookingAppointments = await tx.appointment.findMany({
                where: { bookingId: fixture.bookingId },
                select: { id: true },
            });
const employeeAppointments = await tx.appointment.findMany({
                where: {
                    employeeId: { in: fixture.employeeIds },
                },
                select: { id: true },
            });
const serviceAppointments = await tx.appointmentService.findMany({
                where: {
                    serviceId: { in: fixture.serviceIds },
                },
                select: { appointmentId: true },
            });
const addonAppointments = await tx.appointmentAddon.findMany({
                where: { addonId: fixture.addonId },
                select: { appointmentId: true },
            });
const saleLinks = await tx.saleAppointment.findMany({
                where: {
                    appointmentId: { in: fixture.appointmentIds },
                },
                select: {
                    saleId: true,
                    appointmentId: true,
                },
            });;

        const expectedAppointments = new Set(fixture.appointmentIds);

        const matchesFixture = (ids: number[]) =>
            ids.length === expectedAppointments.size &&
            ids.every((id) => expectedAppointments.has(id));

        if (
            !matchesFixture(customerAppointments.map((a) => a.id)) ||
            !matchesFixture(bookingAppointments.map((a) => a.id)) ||
            !matchesFixture(employeeAppointments.map((a) => a.id)) ||
            serviceAppointments.some(
                (item) => !expectedAppointments.has(item.appointmentId)
            ) ||
            addonAppointments.some(
                (item) => !expectedAppointments.has(item.appointmentId)
            )
        ) {
            throw new Error(
                "Unexpected appointment dependencies. Cleanup stopped."
            );
        }

        // A checkout fixture may have one completed sale.
        // All sale links must belong exclusively to its appointments.
        const saleIds = [...new Set(saleLinks.map((link) => link.saleId))];

        // Only two fixture states are permitted:
        // untouched (no sale) or completed (one sale linked to both appointments).
        const hasCompletedSale = saleIds.length === 1;

        if (
            (saleIds.length === 0 && saleLinks.length !== 0) ||
            (hasCompletedSale && saleLinks.length !== 2)
        ) {
            throw new Error(
                "Unexpected checkout fixture sale state. Cleanup stopped."
            );
        }

        if (
            saleIds.length > 1 ||
            saleLinks.some(
                (link) => !expectedAppointments.has(link.appointmentId)
            )
        ) {
            throw new Error(
                "Unexpected sale relationships. Cleanup stopped."
            );
        }


        // A test sale must not contain appointments outside this fixture.
        // Never delete a sale that includes unrelated customer visits.
        if (saleIds.length === 1) {
            const allSaleLinks = await tx.saleAppointment.findMany({
                where: {
                    saleId: saleIds[0],
                },
                select: {
                    appointmentId: true,
                },
            });

            const hasUnexpectedAppointment = allSaleLinks.some(
                (link) => !expectedAppointments.has(link.appointmentId)
            );

            if (
                hasUnexpectedAppointment ||
                allSaleLinks.length !== saleLinks.length
            ) {
                throw new Error(
                    "Sale includes appointments outside this fixture. Cleanup stopped."
                );
            }
        }


        // Inspect financial records belonging to the fixture sale.
        // Never authorize deletion of payroll-linked records.
        if (saleIds.length === 1) {
            const saleId = saleIds[0];

            const sale = await tx.sale.findUnique({
                    where: { id: saleId },
                });
const payments = await tx.payment.findMany({
                    where: { saleId },
                });
const commissions = await tx.commission.findMany({
                    where: { saleId },
                });
const tips = await tx.tip.findMany({
                    where: { saleId },
                });
const lineItems = await tx.saleLineItem.findMany({
                    where: { saleId },
                });;

            if (!sale) {
                throw new Error(
                    "Fixture sale was not found. Cleanup stopped."
                );
            }

            // Commissions and tips must belong to fixture technicians
            // and must never be linked to payroll.
            if (
                commissions.some(
                    (item) =>
                        !fixture.employeeIds.includes(item.employeeId) ||
                        item.payrollEntryId !== null
                ) ||
                tips.some(
                    (item) =>
                        !fixture.employeeIds.includes(item.employeeId) ||
                        item.payrollEntryId !== null
                )
            ) {
                throw new Error(
                    "Unsafe financial ownership or payroll link."
                );
            }

            // Verify that line items reference only fixture catalog
            // records, technicians, and appointments.
            const lineItemIds = new Set(
                lineItems.map((item) => item.id)
            );

            const invalidLineItem = lineItems.some((item) =>
                !(
                    (item.itemType === "SERVICE" &&
                        item.itemId !== null &&
                        fixture.serviceIds.includes(item.itemId)) ||
                    (item.itemType === "ADDON" &&
                        item.itemId === fixture.addonId)
                ) ||
                (
                    item.employeeId !== null &&
                    !fixture.employeeIds.includes(item.employeeId)
                ) ||
                (
                    item.appointmentId !== null &&
                    !fixture.appointmentIds.includes(item.appointmentId)
                ) ||
                (
                    item.parentLineItemId !== null &&
                    !lineItemIds.has(item.parentLineItemId)
                )
            );

            if (invalidLineItem) {
                throw new Error(
                    "Unexpected sale line-item ownership."
                );
            }

            // A completed test checkout must have the expected
            // financial structure and reconciled amounts.
            const serviceLines = lineItems.filter(
                (item) => item.itemType === "SERVICE"
            );

            const addonLines = lineItems.filter(
                (item) => item.itemType === "ADDON"
            );

            const lineItemSubtotal = lineItems.reduce(
                (total, item) => total + item.unitPrice,
                0
            );

            const commissionBaseTotal = commissions.reduce(
                (total, item) => total + item.commissionBase,
                0
            );

            if (
                saleLinks.length !== 2 ||
                serviceLines.length !== 2 ||
                addonLines.length !== 1 ||
                commissions.length !== 2 ||
                payments.length !== 1 ||
                tips.length > 2 ||
                lineItemSubtotal !== sale.subtotal ||
                commissionBaseTotal !== sale.finalTotal
            ) {
                throw new Error(
                    "Unexpected checkout financial structure. Cleanup stopped."
                );
            }

            // Payments must use supported checkout methods.
            if (
                payments.some(
                    (payment) =>
                        !["CASH", "BOLD", "TRANSFER"].includes(
                            payment.paymentMethod
                        )
                )
            ) {
                throw new Error(
                    "Unexpected payment method. Cleanup stopped."
                );
            }

            console.log("Financial ownership: VERIFIED");
            console.log("Payments:", payments.length);
            console.log("Commissions:", commissions.length);
            console.log("Tips:", tips.length);
            console.log("Line items:", lineItems.length);
        }

        console.log("Sale ownership: VERIFIED");

        console.log("Appointment dependencies: VERIFIED");
        console.log("Linked checkout sales:", saleIds.length);

        console.log("Payroll dependencies: NONE");


        // Check for relationships that checkout fixtures should never create.
        // Any unexpected dependency prevents future cleanup.
        const pushSubscriptions = await tx.pushSubscription.count({
                where: { userId: fixture.ownerId },
            });
const inventoryMovements = await tx.inventoryMovement.count({
                where: { userId: fixture.ownerId },
            });
const employeeScheduleBlocks = await tx.employeeScheduleBlock.count({
                where: {
                    employeeId: { in: fixture.employeeIds },
                },
            });
const employeeUsers = await tx.user.count({
                where: {
                    employeeId: { in: fixture.employeeIds },
                },
            });
const customerBookings = await tx.booking.findMany({
                where: { customerId: fixture.customerId },
                select: { id: true },
            });
const serviceAddonRelations = await tx.serviceAddon.findMany({
                where: {
                    OR: [
                        { serviceId: { in: fixture.serviceIds } },
                        { addonId: fixture.addonId },
                    ],
                },
                select: {
                    serviceId: true,
                    addonId: true,
                },
            });
const employeeServiceRelations = await tx.employeeService.findMany({
                where: {
                    OR: [
                        { employeeId: { in: fixture.employeeIds } },
                        { serviceId: { in: fixture.serviceIds } },
                    ],
                },
                select: {
                    employeeId: true,
                    serviceId: true,
                },
            });
const loginAttempts = await tx.loginAttempt.count({
                where: {
                    email: `${fixture.marker}@example.invalid`,
                },
            });;

        // The fixture should have exactly one booking.
        if (
            customerBookings.length !== 1 ||
            customerBookings[0].id !== fixture.bookingId
        ) {
            throw new Error(
                "Unexpected customer booking dependencies."
            );
        }

        // The fixture creator establishes one allowed add-on relationship.
        const validServiceAddons =
            serviceAddonRelations.length === 1 &&
            serviceAddonRelations[0].serviceId === fixture.serviceIds[0] &&
            serviceAddonRelations[0].addonId === fixture.addonId;

        // Each fixture technician is qualified for exactly one test service.
        const validEmployeeServices =
            employeeServiceRelations.length === 2 &&
            fixture.employeeIds.every(
                (employeeId, index) =>
                    employeeServiceRelations.some(
                        (relation) =>
                            relation.employeeId === employeeId &&
                            relation.serviceId === fixture.serviceIds[index]
                    )
            );

        if (
            pushSubscriptions !== 0 ||
            inventoryMovements !== 0 ||
            employeeScheduleBlocks !== 0 ||
            employeeUsers !== 0 ||
            loginAttempts !== 0 ||
            !validServiceAddons ||
            !validEmployeeServices
        ) {
            throw new Error(
                "Unexpected fixture dependencies. Cleanup stopped."
            );
        }

        // Fixture technicians must not have financial records
        // belonging to any unrelated sale.
        const externalFinancialRecords = [];
externalFinancialRecords.push(await tx.commission.count({
                where: {
                    employeeId: { in: fixture.employeeIds },
                    ...(saleIds.length === 1
                        ? { saleId: { not: saleIds[0] } }
                        : {}),
                },
            }));
externalFinancialRecords.push(await tx.tip.count({
                where: {
                    employeeId: { in: fixture.employeeIds },
                    ...(saleIds.length === 1
                        ? { saleId: { not: saleIds[0] } }
                        : {}),
                },
            }));
externalFinancialRecords.push(await tx.saleLineItem.count({
                where: {
                    OR: [
                        { employeeId: { in: fixture.employeeIds } },
                        { appointmentId: { in: fixture.appointmentIds } },
                    ],
                    ...(saleIds.length === 1
                        ? { saleId: { not: saleIds[0] } }
                        : {}),
                },
            }));;

        if (externalFinancialRecords.some((count) => count !== 0)) {
            throw new Error(
                "Fixture has financial records outside its sale. Cleanup stopped."
            );
        }

        console.log("External financial references: NONE");

        console.log("Additional fixture dependencies: VERIFIED");

        console.log("Checkout fixture ownership: VERIFIED");
        console.log("Database: Neon Development");

        if (deleteRequested) {
            // Real deletion remains disabled.
            throw new Error("CHECKOUT_FIXTURE_DELETION_NOT_IMPLEMENTED");
        }

        if (dryRunDelete) {

            // The following operations are intentionally unreachable.
            // They will be enabled only after complete cleanup validation.
            if (saleIds.length === 1) {
                const saleId = saleIds[0];

                // Remove only financial records belonging to this sale.
                const deletedTips = await tx.tip.deleteMany({
                    where: { saleId },
                });

                if (deletedTips.count > 2) {
                    throw new Error("CHECKOUT_FIXTURE_TIP_COUNT_MISMATCH");
                }

                const deletedCommissions = await tx.commission.deleteMany({
                    where: { saleId },
                });

                if (deletedCommissions.count !== 2) {
                    throw new Error("CHECKOUT_FIXTURE_COMMISSION_COUNT_MISMATCH");
                }

                const deletedPayments = await tx.payment.deleteMany({
                    where: { saleId },
                });

                if (deletedPayments.count !== 1) {
                    throw new Error("CHECKOUT_FIXTURE_PAYMENT_COUNT_MISMATCH");
                }

                // Delete add-ons before their parent service lines.
                const deletedAddons = await tx.saleLineItem.deleteMany({
                    where: { saleId, itemType: "ADDON" },
                });

                if (deletedAddons.count !== 1) {
                    throw new Error("CHECKOUT_FIXTURE_ADDON_COUNT_MISMATCH");
                }

                const deletedServiceLines = await tx.saleLineItem.deleteMany({
                    where: { saleId, itemType: "SERVICE" },
                });

                if (deletedServiceLines.count !== 2) {
                    throw new Error("CHECKOUT_FIXTURE_LINE_COUNT_MISMATCH");
                }

                const deletedSaleLinks = await tx.saleAppointment.deleteMany({
                    where: { saleId },
                });

                if (deletedSaleLinks.count !== 2) {
                    throw new Error("CHECKOUT_FIXTURE_SALE_LINK_COUNT_MISMATCH");
                }

                await tx.sale.delete({
                    where: { id: saleId },
                });
            }

            // Remove booked add-ons and services before appointments.
            await tx.appointmentAddon.deleteMany({
                where: {
                    appointmentId: { in: fixture.appointmentIds },
                },
            });

              // Every fixture must contain exactly two booked services.
              const deletedAppointmentServices =
                  await tx.appointmentService.deleteMany({
                      where: {
                          appointmentId: {
                              in: fixture.appointmentIds,
                          },
                      },
                  });

              if (deletedAppointmentServices.count !== 2) {
                  throw new Error(
                      "CHECKOUT_FIXTURE_SERVICE_COUNT_MISMATCH"
                  );
              }

              // Both fixture appointments must be removed together.
              const deletedAppointments =
                  await tx.appointment.deleteMany({
                      where: {
                          id: {
                              in: fixture.appointmentIds,
                          },
                      },
                  });

              if (deletedAppointments.count !== 2) {
                  throw new Error(
                      "CHECKOUT_FIXTURE_APPOINTMENT_COUNT_MISMATCH"
                  );
              }

            // Remove the customer visit after its appointments.
            await tx.booking.delete({
                where: { id: fixture.bookingId },
            });

            // Remove technician qualifications and allowed add-ons.
            const deletedQualifications = await tx.employeeService.deleteMany({
                where: {
                    employeeId: { in: fixture.employeeIds },
                    serviceId: { in: fixture.serviceIds },
                },
            });

            if (deletedQualifications.count !== 2) {
                throw new Error("CHECKOUT_FIXTURE_QUALIFICATION_COUNT_MISMATCH");
            }

            const deletedAddonRelations = await tx.serviceAddon.deleteMany({
                where: {
                    serviceId: fixture.serviceIds[0],
                    addonId: fixture.addonId,
                },
            });

            if (deletedAddonRelations.count !== 1) {
                throw new Error("CHECKOUT_FIXTURE_ADDON_RELATION_COUNT_MISMATCH");
            }

            // Remove the isolated catalog records.
            await tx.addon.delete({
                where: { id: fixture.addonId },
            });

            // Both test services must be deleted together.
            const deletedServices = await tx.service.deleteMany({
                where: {
                    id: { in: fixture.serviceIds },
                },
            });

            if (deletedServices.count !== 2) {
                throw new Error("CHECKOUT_FIXTURE_CATALOG_COUNT_MISMATCH");
            }

            // Both isolated technicians must be removed together.
            const deletedEmployees = await tx.employee.deleteMany({
                where: {
                    id: { in: fixture.employeeIds },
                },
            });

            if (deletedEmployees.count !== 2) {
                throw new Error("CHECKOUT_FIXTURE_EMPLOYEE_COUNT_MISMATCH");
            }

            await tx.customer.delete({
                where: { id: fixture.customerId },
            });

            // Remove the isolated OWNER last.
            await tx.user.delete({
                where: { id: fixture.ownerId },
            });

            // Verify fixture records are gone before committing cleanup.
            const remaining = [];
remaining.push(await tx.user.count({ where: { id: fixture.ownerId } }));
remaining.push(await tx.customer.count({ where: { id: fixture.customerId } }));
remaining.push(await tx.booking.count({ where: { id: fixture.bookingId } }));
remaining.push(await tx.employee.count({
                    where: { id: { in: fixture.employeeIds } },
                }));
remaining.push(await tx.service.count({
                    where: { id: { in: fixture.serviceIds } },
                }));
remaining.push(await tx.addon.count({ where: { id: fixture.addonId } }));
remaining.push(await tx.appointment.count({
                    where: { id: { in: fixture.appointmentIds } },
                }));
remaining.push(await tx.sale.count({
                    where: { id: { in: saleIds } },
                }));
remaining.push(await tx.saleAppointment.count({
                    where: { saleId: { in: saleIds } },
                }));
remaining.push(await tx.saleLineItem.count({
                    where: { saleId: { in: saleIds } },
                }));
remaining.push(await tx.payment.count({
                    where: { saleId: { in: saleIds } },
                }));
remaining.push(await tx.commission.count({
                    where: { saleId: { in: saleIds } },
                }));
remaining.push(await tx.tip.count({
                    where: { saleId: { in: saleIds } },
                }));;

            if (remaining.some((count) => count !== 0)) {
                throw new Error(
                    "CHECKOUT_FIXTURE_POST_DELETE_VERIFICATION_FAILED"
                );
            }

        }

        if (dryRunDelete) {
            // Force PostgreSQL to roll back all test deletions.
            throw new Error("CHECKOUT_FIXTURE_DRY_RUN_ROLLBACK");
        }

        console.log("Verification complete. No records deleted.");
        },
            {
                isolationLevel: "Serializable",
                maxWait: 10000,
                timeout: 30000,
            }
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("Checkout fixture verification failed:", error);
    process.exitCode = 1;
});