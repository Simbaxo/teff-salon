import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { canCheckout } from "@/lib/auth-roles";
import { lockPayrollWeek } from "@/lib/payroll/period-lock";
import { assertCheckoutVisitUnchanged } from "@/lib/checkout/validate-visit-snapshot";
import { getAssignmentPayloadError } from "@/lib/checkout/assignment-payload-guard";
import { isAttributedCheckoutEnabled } from "@/lib/checkout/is-attributed-checkout-enabled";
import {
    authorizeAttributedCheckoutTest,
    authorizeAttributedFixtureAppointments,
} from "@/lib/checkout/authorize-attributed-test";import { validateAttributedCheckout } from "@/lib/checkout/validate-attributed-checkout";
import { writeCheckoutLineItems } from "@/lib/checkout/write-checkout-line-items";
import { getEligibleTipTechnicians } from "@/lib/checkout/get-eligible-tip-technicians";
import { selectCheckoutFinancials } from "@/lib/checkout/select-checkout-financials";
import type {
    CheckoutServiceAssignment,
    CheckoutAddonAssignment,
} from "@/lib/checkout/types";

// Payment methods currently accepted by TEFF
const allowedPaymentMethods = ["CASH", "BOLD", "TRANSFER"];

export async function POST(request: Request) {
    const session = await auth();

    // Only authenticated TEFF staff can complete sales
    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    // Only OWNER and RECEPTIONIST can complete checkout
    if (!canCheckout(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }
    
    try {
        const body = await request.json();

        const {
            appointmentId,
            appointmentIds,
            serviceIds,
            addonIds,
            servicePrices,
            addonPrices,
            discountTotal,
            payments,
            tips,
            serviceAssignments,
            addonAssignments,
        } = body;

        // Production authorization is controlled by a server-side flag.
        // The isolated Development test authorization remains supported.
        const allowAttributedTest = authorizeAttributedCheckoutTest(
            session.user
        );

        const allowAttributedProduction = isAttributedCheckoutEnabled(
            session.user.role
        );

        const allowAttributedCheckout =
            allowAttributedTest || allowAttributedProduction;

        const assignmentError = getAssignmentPayloadError(
            serviceAssignments,
            addonAssignments,
            allowAttributedCheckout
        );

        if (assignmentError) {
            return Response.json(
                assignmentError.body,
                { status: assignmentError.status }
            );
        }

        // Identify the requested checkout format.
        // The API guard still blocks attributed requests until release.
        const usesAttributedCheckout =
            serviceAssignments !== undefined &&
            addonAssignments !== undefined;

        // Make sure the checkout contains the basic required information
        if (
            !appointmentId ||
            !Array.isArray(appointmentIds) ||
            appointmentIds.length === 0 ||
            !Array.isArray(serviceIds) ||
            serviceIds.length === 0 ||
            !Array.isArray(addonIds) ||
            !Array.isArray(servicePrices) ||
            !Array.isArray(addonPrices) ||
            !Array.isArray(payments) ||
            !Array.isArray(tips)
        ) {
            return Response.json(
                { error: "Invalid checkout information" },
                { status: 400 }
            );
        }

        const uniqueAppointmentIds = [
            ...new Set<number>(appointmentIds),
        ];

        const hasInvalidAppointmentIds =
            uniqueAppointmentIds.some(
                (id: unknown) =>
                    !Number.isInteger(id) ||
                    (id as number) <= 0
            );

        if (hasInvalidAppointmentIds) {
            return Response.json(
                { error: "Invalid appointment IDs" },
                { status: 400 }
            );
        }

        // Remove duplicate IDs before validation selections
        const uniqueServiceIds = [...new Set(serviceIds)];
        const uniqueAddonIds = [...new Set(addonIds)];

        // Repeated add-ons require instance-aware financial processing.
        // Do not allow legacy checkout to silently merge duplicate charges.
        const hasRepeatedAddonIds =
            uniqueAddonIds.length !== addonIds.length;

        // Repeated add-ons are validated individually below.
        // Legacy checkout must still reject ambiguous technician attribution.

        // Checkout prices may be adjusted for this sale only.
        // They must still be valid whole Colombian-peso amounts.
        const servicePricesAreValid = servicePrices.every(
            (item: { serviceId: number; price: number }) =>
                Number.isInteger(item.serviceId) &&
                item.serviceId > 0 &&
                Number.isInteger(item.price) &&
                item.price >= 0
        );

        const addonPricesAreValid = addonPrices.every(
            (item: {
                instanceId?: string;
                addonId: number;
                price: number;
            }) =>
                Number.isSafeInteger(item.addonId) &&
                item.addonId > 0 &&
                Number.isSafeInteger(item.price) &&
                item.price >= 0 &&
                (
                    item.instanceId === undefined ||
                    (
                        typeof item.instanceId === "string" &&
                        item.instanceId.trim().length > 0
                    )
                )
        );

        if (!servicePricesAreValid || !addonPricesAreValid) {
            return Response.json(
                { error: "Invalid checkout line-item prices" },
                { status: 400 }
            );
        }

        const submittedServicePrices = new Map<number, number>(
            servicePrices.map(
                (item: { serviceId: number; price: number }) => [
                    item.serviceId,
                    item.price,
                ]
            )
        );

        const submittedAddonPrices = new Map<number, number>(
            addonPrices.map(
                (item: { addonId: number; price: number }) => [
                    item.addonId,
                    item.price,
                ]
            )
        );

        // Each add-on occurrence has its own price.
        // Legacy requests continue using the catalog ID.
        const addonPriceEntries = addonPrices as {
            instanceId?: string;
            addonId: number;
            price: number;
        }[];

        // Accept either legacy add-ons or instance-aware add-ons.
        // Never mix both formats within one checkout request.
        const hasLegacyAddonEntries = addonPriceEntries.some(
            (item) => item.instanceId === undefined
        );

        const hasInstanceAwareAddonEntries = addonPriceEntries.some(
            (item) => item.instanceId !== undefined
        );

        if (hasLegacyAddonEntries && hasInstanceAwareAddonEntries) {
            return Response.json(
                {
                    error:
                        "Los adicionales deben usar un formato de identificación consistente.",
                    conflictType: "MIXED_ADDON_IDENTIFIERS",
                },
                { status: 400 }
            );
        }

        const addonInstanceKey = (item: {
            instanceId?: string;
            addonId: number;
        }) =>
            item.instanceId === undefined
                ? `legacy-${item.addonId}`
                : `instance-${item.instanceId}`;

        const submittedAddonInstances = new Map(
            addonPriceEntries.map((item) => [
                addonInstanceKey(item),
                item,
            ])
        );

        const addonInstancePricesMatch =
            submittedAddonInstances.size === addonPriceEntries.length &&
            addonPriceEntries.length === addonIds.length &&
            addonPriceEntries.every(
                (item, index) =>
                    item.addonId === addonIds[index]
            );

        const servicePriceIdsMatch =
            submittedServicePrices.size === uniqueServiceIds.length &&
            uniqueServiceIds.every((id) =>
                submittedServicePrices.has(id)
            );

        // Every submitted add-on occurrence must have a matching price.
        // Repeated catalog IDs require unique instance identifiers.
        const addonPriceIdsMatch =
            addonInstancePricesMatch &&
            (
                hasRepeatedAddonIds
                    ? addonPriceEntries.every(
                        (item) =>
                            typeof item.instanceId === "string" &&
                            item.instanceId.trim().length > 0
                    )
                    : submittedAddonPrices.size === uniqueAddonIds.length &&
                    uniqueAddonIds.every((id) =>
                        submittedAddonPrices.has(id)
                    )
            );

        if (
            !servicePriceIdsMatch ||
            !addonPriceIdsMatch ||
            !addonInstancePricesMatch
        ) {
            return Response.json(
                { error: "Checkout prices do not match selected items" },
                { status: 400 }
            );
        }

        // Make sure the discount is a valid whole COP amount
        if (
            !Number.isInteger(discountTotal) ||
            discountTotal < 0
        ) {
            return Response.json(
                { error: "Invalid discount" },
                { status: 400 }
            );
        }

        // Verify every payment has a supported method and valid amount
        const paymentsAreValid = payments.every(
            (payment: { paymentMethod: string; amount: number }) =>
                allowedPaymentMethods.includes(payment.paymentMethod) &&
            Number.isInteger(payment.amount) &&
            payment.amount > 0
        );

        if (!paymentsAreValid) {
            return Response.json(
                { error: "Invalid payment information" },
                { status: 400 }
            );
        }

        // Validate each technician-specific tip.
        const tipsAreValid = tips.every(
            (tip: {
                employeeId: number;
                amount: number;
                paymentMethod: string;
            }) =>
                Number.isInteger(tip.employeeId) &&
                tip.employeeId > 0 &&
                Number.isInteger(tip.amount) &&
                tip.amount > 0 &&
                allowedPaymentMethods.includes(tip.paymentMethod)
        );

        if (!tipsAreValid) {
            return Response.json(
                { error: "Invalid tip information" },
                { status: 400 }
            );
        }

        // Load every appointment block submitted for this customer visit.
        // Technician ownership is read from the database, never trusted from the browser.
        const visitAppointments = await prisma.appointment.findMany({
            where: {
                id: {
                    in: uniqueAppointmentIds,
                },
            },
            include: {
                employee: true,

                appointmentServices: {
                    select: {
                        serviceId: true,
                        bookedPrice: true,
                    },
                },

                appointmentAddons: {
                    select: {
                        id: true,
                        appointmentId: true,
                        addonId: true,
                        bookedPrice: true,
                    },
                },
            },
        });

        // Every submitted appointment ID must exist.
        if (visitAppointments.length !== uniqueAppointmentIds.length) {
            return Response.json(
                { error: "One or more appointments were not found" },
                { status: 404 }
            );
        }

        // Test-only attributed checkout must use the exact isolated
        // customer visit. Never permit unrelated Development appointments.
        if (
            usesAttributedCheckout &&
                !allowAttributedProduction &&
                !authorizeAttributedFixtureAppointments(
                appointmentIds,
                visitAppointments
            )
        ) {
            return Response.json(
                {
                    error:
                        "Esta cita no está autorizada para pruebas de asignación.",
                    conflictType: "TEST_FIXTURE_NOT_AUTHORIZED",
                },
                { status: 403 }
            );
        }

        // Use the appointment that opened checkout as the visit anchor.
        const appointment = visitAppointments.find(
            (item) => item.id === Number(appointmentId)
        );

        if (!appointment) {
            return Response.json(
                { error: "Checkout appointment is not part of this visit" },
                { status: 400 }
            );
        }

        // New multi-service bookings must all belong to the same Booking.
        // Legacy appointments without a booking may only checkout individually.
        const submittedBookingIds = new Set(
            visitAppointments.map((item) => item.bookingId)
        );

        const appointmentsBelongToSameVisit =
            appointment.bookingId !== null
                ? submittedBookingIds.size === 1 &&
                submittedBookingIds.has(appointment.bookingId)
                : visitAppointments.length === 1;

        if (!appointmentsBelongToSameVisit) {
            return Response.json(
                { error: "Appointments do not belong to the same customer visit" },
                { status: 400 }
            );
        }

        // All appointments in one checkout must share the same service date.
        // This keeps technician production and payroll attribution consistent.
        const serviceDates = new Set(
            visitAppointments.map((item) =>
                item.date.toISOString().slice(0, 10)
            )
        );

        if (serviceDates.size !== 1) {
            return Response.json(
                {
                    error:
                        "All appointments in one sale must have the same service date",
                },
                { status: 400 }
            );
        }

        // Identify each booked add-on by its database record ID.
        // Keep its original appointment and catalog association.
        const bookedAddonInstances = new Map<
            string,
            {
                appointmentId: number;
                addonId: number;
                bookedPrice: number;
            }
        >();
        // Load each booked add-on exactly once from verified appointments.
        for (const visitAppointment of visitAppointments) {
            for (const item of visitAppointment.appointmentAddons) {
                bookedAddonInstances.set(`booked-${item.id}`, {
                    appointmentId: visitAppointment.id,
                    addonId: item.addonId,
                    bookedPrice: item.bookedPrice,
                });
            }
        }
        // Legacy requests without instance IDs cannot distinguish
        // multiple booked occurrences of the same catalog add-on.
        const legacyAddonIds = new Set(
            addonPriceEntries
                .filter((item) => item.instanceId === undefined)
                .map((item) => item.addonId)
        );

        const bookedAddonCounts = new Map<number, number>();

        for (const booked of bookedAddonInstances.values()) {
            bookedAddonCounts.set(
                booked.addonId,
                (bookedAddonCounts.get(booked.addonId) ?? 0) + 1
            );
        }

        const hasAmbiguousLegacyAddon = [...legacyAddonIds].some(
            (addonId) =>
                (bookedAddonCounts.get(addonId) ?? 0) > 1
        );

        if (hasAmbiguousLegacyAddon) {
            return Response.json(
                {
                    error:
                        "Los adicionales repetidos requieren identificación individual.",
                    conflictType: "AMBIGUOUS_LEGACY_ADDONS",
                },
                { status: 409 }
            );
        }

        // Validate every explicitly identified add-on occurrence.
        const invalidAddonInstance = addonPriceEntries.some((item) => {
            const instanceId = item.instanceId;

            // Older requests may omit instance IDs.
            if (instanceId === undefined) {
                return false;
            }

            // Booked instances must match an actual record from this visit.
            if (instanceId.startsWith("booked-")) {
                const booked = bookedAddonInstances.get(instanceId);

                return !booked || booked.addonId !== item.addonId;
            }

            // New instances cannot impersonate booked records.
            return (
                instanceId.startsWith("instance-") ||
                instanceId.startsWith("legacy-") ||
                bookedAddonInstances.has(instanceId)
            );
        });

        if (invalidAddonInstance) {
            return Response.json(
                {
                    error: "Invalid checkout add-on instance",
                    conflictType: "INVALID_ADDON_INSTANCE",
                },
                { status: 400 }
            );
        }

        // Remember the original booked service prices across the complete visit.
        const bookedServicePrices = new Map<number, number>();

        for (const visitAppointment of visitAppointments) {
            for (const item of visitAppointment.appointmentServices) {
                bookedServicePrices.set(
                    item.serviceId,
                    item.bookedPrice
                );
            }
        }

        // Remember the original booked add-on prices across the complete visit.
        const bookedAddonPrices = new Map<number, number>();

        for (const visitAppointment of visitAppointments) {
            for (const item of visitAppointment.appointmentAddons) {
                bookedAddonPrices.set(
                    item.addonId,
                    item.bookedPrice
                );
            }
        }

        // Load all selected services, including inactive ones.
        // Previously booked services must still be honored at checkout
        const services = await prisma.service.findMany({
            where: {
                id: {
                    in: uniqueServiceIds,
                },
            },
        });

        // Make sure every requested service actually exists and is active
        if (services.length !== uniqueServiceIds.length) {
            return Response.json(
                { error: "One or more services are invalid" },
                { status: 400 }
            );
        }

        // An inactive service is allowed only if it was part of the original booking
        const hasInvalidInactiveService = services.some(
            (service) =>
                !service.active &&
                !bookedServicePrices.has(service.id)
        );

        if (hasInvalidInactiveService) {
            return Response.json(
                { error: "An inactive service cannot be added during checkout" },
                { status: 400 }
            );
        }

        // Load all selected add-ons, including inactive ones.
        // Previously booked add-ons must still be honored at checkout
        const addons = await prisma.addon.findMany({
            where: {
                id: {
                    in: uniqueAddonIds,
                },
            },
        });

        // Load the valid service/add-on relationships for the selected services
        const serviceAddonRelations = await prisma.serviceAddon.findMany({
            where: {
                serviceId: {
                    in: uniqueServiceIds,
                },
            },
        });

        // Collect every add-on that is allowed by at least one selected service
        const allowedAddonIds = new Set(
            serviceAddonRelations.map((relation) => relation.addonId)
        );

        // Identify newly added occurrences, even when their catalog ID
        // matches an add-on that was originally booked.
        const newAddonIds = [
            ...new Set(
                addonPriceEntries
                    .filter((item) =>
                        item.instanceId !== undefined
                            ? !bookedAddonInstances.has(item.instanceId)
                            : !bookedAddonPrices.has(item.addonId)
                    )
                    .map((item) => item.addonId)
            ),
        ];

        // Reject add-ons that do not belong to any selected services
        const hasInvalidAddon = newAddonIds.some(
            (addonId: number) => !allowedAddonIds.has(addonId)
        );

        if (hasInvalidAddon) {
            return Response.json(
                { error: "One or more add-ons are not valid for the selected services"},
                { status: 400 }
            );
        }

        // Services added during checkout must be performable by at least one
        // technician already working on this customer visit.
        const visitEmployeeIds = [
            ...new Set(
                visitAppointments.map(
                    (visitAppointment) => visitAppointment.employeeId
                )
            ),
        ];

        const visitEmployeeServices =
            await prisma.employeeService.findMany({
                where: {
                    employeeId: {
                        in: visitEmployeeIds,
                    },
                },
            });

        // Only newly added services need current qualification validation.
        // Originally booked services already belong to their appointment block.
        const newServiceIds = uniqueServiceIds.filter(
            (serviceId) => !bookedServicePrices.has(serviceId)
        );

        const hasUnsupportedService = newServiceIds.some(
            (serviceId: number) =>
                !visitEmployeeServices.some(
                    (relation) => relation.serviceId === serviceId
                )
        );

        // Legacy checkout uses the original appointment technicians.
        // Attributed checkout validates selected technicians inside the transaction.
        if (!usesAttributedCheckout && hasUnsupportedService) {
            return Response.json(
                {
                    error:
                        "No technician on this visit is qualified for one or more added services",
                },
                { status: 400 }
            );
        }

       // A new instance is one that does not reference
        // an originally booked add-on record.
        const hasNewAddonInstances = addonPriceEntries.some((item) => {
            if (item.instanceId !== undefined) {
                return !bookedAddonInstances.has(item.instanceId);
            }

            // Preserve existing single-add-on legacy requests.
            return !bookedAddonPrices.has(item.addonId);
        });

        const hasNewCheckoutItems =
            newServiceIds.length > 0 || hasNewAddonInstances;

        // Explicit service assignments remove the need to guess ownership.
        // Keep this restriction for legacy checkout.
        if (
            !usesAttributedCheckout &&
            hasNewCheckoutItems &&
            visitEmployeeIds.length > 1
        ) {
            return Response.json(
                {
                    error:
                        "Added checkout items cannot be assigned automatically when multiple technicians worked on the visit",
                },
                { status: 400 }
            );
        }

        // Make sure every requested add-on actually exists
        if (addons.length !== uniqueAddonIds.length) {
            return Response.json(
                { error: "One or more add-ons are invalid"},
                { status: 400 }
            );
        }

        // Originally booked inactive add-ons may still be honored.
        // Newly added occurrences must use an active catalog add-on.
        const hasInvalidInactiveAddon = addonPriceEntries.some((item) => {
            const addon = addons.find(
                (catalogItem) => catalogItem.id === item.addonId
            );

            if (!addon) {
                return true;
            }

            if (addon.active) {
                return false;
            }

            if (item.instanceId !== undefined) {
                return !bookedAddonInstances.has(item.instanceId);
            }

            // Backward compatibility for legacy requests without instance IDs.
            return !bookedAddonPrices.has(item.addonId);
        });

        if (hasInvalidInactiveAddon) {
            return Response.json(
                { error: "An inactive add-on cannot be added during checkout" },
                { status: 400 }
            );
        }

        // Use the validated checkout price for this specific sale.
        // Catalog and original booking prices remain unchanged.
        const servicesTotal = services.reduce(
            (total, service) =>
                total + (submittedServicePrices.get(service.id) ?? 0),
            0
        );

        // Count each validated add-on occurrence separately.
        // Catalog IDs may repeat, but each selected instance has its own price.
        const addonsTotal = addonPriceEntries.reduce(
            (total, item) => total + item.price,
            0
        );

        // The browser's subtotal is never trusted
        const subtotal = servicesTotal + addonsTotal;

        // Discount cannot be greater than the subtotal
        if (discountTotal > subtotal) {
            return Response.json(
            { error: "Discount exceeds subtotal" },
            { status: 400 }
            );
        }

        const finalTotal = subtotal - discountTotal;

        // A completed sale must have a positive service total
        if (finalTotal <= 0) {
            return Response.json(
                { error: "Final total must be greater than zero" },
                { status: 400 }
            );
        }

        // Legacy checkout attributes revenue using appointment ownership.
        // Attributed checkout calculates technician revenue inside the transaction.
        let appointmentCommissionBases: {
            appointmentId: number;
            employeeId: number;
            commissionBase: number;
        }[] = [];

        if (!usesAttributedCheckout) {

        // Calculate the booked revenue belonging to each appointment block.
        // This preserves which technician actually performed each service.
        const appointmentRevenue = visitAppointments.map(
            (visitAppointment) => {
                const serviceRevenue =
                    visitAppointment.appointmentServices.reduce(
                        (total, item) => {
                            // Only include services that remain in the final checkout.
                            if (!uniqueServiceIds.includes(item.serviceId)) {
                                return total;
                            }

                            return (
                                total +
                                (submittedServicePrices.get(item.serviceId) ?? 0)
                            );
                        },
                        0
                    );

                const addonRevenue =
                    visitAppointment.appointmentAddons.reduce(
                        (total, item) => {
                            const instanceId = `booked-${item.id}`;

                            const submitted =
                                submittedAddonInstances.get(`instance-${instanceId}`);

                            if (submitted) {
                                return total + submitted.price;
                            }

                            // Backward compatibility for requests without instance IDs.
                            const legacyPrice =
                                submittedAddonInstances.get(
                                    `legacy-${item.addonId}`
                                );

                            if (legacyPrice) {
                                return total + legacyPrice.price;
                            }

                            return total;
                        },
                        0
                    );

                return {
                    appointmentId: visitAppointment.id,
                    employeeId: visitAppointment.employeeId,
                    revenue: serviceRevenue + addonRevenue,
                };
            }
        );

        // If only one technician worked on the visit, any service or add-on
        // added during checkout belongs to that technician.
        if (hasNewCheckoutItems && visitEmployeeIds.length === 1) {
            const addedServiceRevenue = services
                .filter((service) => newServiceIds.includes(service.id))
                .reduce(
                    (total, service) =>
                        total +
                        (submittedServicePrices.get(service.id) ?? 0),
                    0
                );

            // Count every newly added add-on occurrence exactly once.
            // Originally booked add-ons are already counted in appointmentRevenue.
            const addedAddonRevenue = addonPriceEntries
                .filter((item) => {
                    if (item.instanceId !== undefined) {
                        return !bookedAddonInstances.has(item.instanceId);
                    }

                    // Preserve older single-add-on requests.
                    return !bookedAddonPrices.has(item.addonId);
                })
                .reduce(
                    (total, item) => total + item.price,
                    0
                );

            const addedRevenue =
                addedServiceRevenue + addedAddonRevenue;

            if (addedRevenue > 0) {
                const singleEmployeeId = visitEmployeeIds[0];

                const revenueTarget = appointmentRevenue.find(
                    (item) => item.employeeId === singleEmployeeId
                );

                if (!revenueTarget) {
                    return Response.json(
                        {
                            error:
                                "Unable to attribute added checkout items to technician",
                        },
                        { status: 400 }
                    );
                }

                revenueTarget.revenue += addedRevenue;
            }
        }

        // Confirm that all sale revenue has been attributed to appointment technicians.
        const attributedRevenueTotal = appointmentRevenue.reduce(
            (total, item) => total + item.revenue,
            0
        );

        // Every peso of service revenue must be attributed before checkout.
        if (attributedRevenueTotal !== subtotal) {
            return Response.json(
                {
                    error:
                        "Checkout revenue could not be fully attributed to technicians",
                },
                { status: 400 }
            );
        }

        // Allocate the sale-level discount proportionally across appointment blocks.
        // The final block receives any rounding remainder so totals stay exact.
        let remainingDiscount = discountTotal;

            appointmentCommissionBases = appointmentRevenue.map(
                (item, index) => {
                    let allocatedDiscount = 0;

                    if (discountTotal > 0 && attributedRevenueTotal > 0) {
                        const isLastItem =
                            index === appointmentRevenue.length - 1;

                        allocatedDiscount = isLastItem
                            ? remainingDiscount
                            : Math.round(
                                discountTotal *
                                    (item.revenue / attributedRevenueTotal)
                            );

                        allocatedDiscount = Math.min(
                            allocatedDiscount,
                            remainingDiscount,
                            item.revenue
                        );

                        remainingDiscount -= allocatedDiscount;
                    }

                    return {
                        appointmentId: item.appointmentId,
                        employeeId: item.employeeId,
                        commissionBase:
                            item.revenue - allocatedDiscount,
                    };
                }
            );
        } // End legacy appointment-based revenue attribution.

        // Add all submitted payment amounts together
        const paymentTotal = payments.reduce(
            (
                total: number,
                payment: { paymentMethod: string;  amount: number }
            ) => total + payment.amount,
            0
        );

        // Cash tips go directly to technicians.
        // Electronic tips are collected by TEFF and must be included in payment.
        const electronicTip = tips.reduce(
            (
                total: number,
                tip: {
                    employeeId: number;
                    amount: number;
                    paymentMethod: string;
                }
            ) =>
                tip.paymentMethod === "CASH"
                    ? total
                    : total + tip.amount,
            0
        );

        // Calculate the customer-paid Bold processing fee on the server.
        // The Bold payment amount already includes any tips paid through Bold.
        const boldPayment = payments.find(
            (payment: {
                paymentMethod: string;
                amount: number;
            }) => payment.paymentMethod === "BOLD"
        );

        const boldBase = boldPayment?.amount ?? 0;

        const boldProcessingFee =
            boldBase <= 0
                ? 0
                : boldBase <= 100000
                    ? 5000
                    : Math.round(boldBase * 0.05);
        
        const expectedPaymentTotal = finalTotal + electronicTip;

        if (paymentTotal !== expectedPaymentTotal) {
            return Response.json(
                {
                    error: "Payment total does not match amount due",
                },
                { status: 400 }
            );
        }

        // Only create payment records for methods that actually received money
        const paymentsToCreate = payments.filter(
            (payment: { paymentMethod: string; amount: number }) =>
                payment.amount > 0
        );

        // Legacy commissions are prepared from appointment ownership.
        // Attributed checkout uses its validated transaction snapshot.
        let commissionsToCreate: {
            employeeId: number;
            commissionBase: number;
            commissionRate: number;
            commissionAmount: number;
        }[] = [];

        if (!usesAttributedCheckout) {
            // Temporary default until commission rates are stored per employee.
            const commissionRate = 50;

            // Combine appointment-level commission bases when the same technician
            // performed more than one service block in the customer visit.
            const commissionByEmployee = new Map<number, number>();

            for (const item of appointmentCommissionBases) {
                if (item.commissionBase <= 0) {
                    continue;
                }

                const currentBase =
                    commissionByEmployee.get(item.employeeId) ?? 0;

                commissionByEmployee.set(
                    item.employeeId,
                    currentBase + item.commissionBase
                );
            }

            commissionsToCreate = Array.from(
                commissionByEmployee.entries()
            ).map(([employeeId, commissionBase]) => ({
                employeeId,
                commissionBase,
                commissionRate,
                commissionAmount: Math.round(
                    commissionBase * (commissionRate / 100)
                ),
            }));
        } // End legacy commission preparation.

        // Prevent any appointment block in this visit from being sold twice.
        const hasCompletedAppointment = visitAppointments.some(
            (visitAppointment) =>
                visitAppointment.status === "COMPLETED"
        );

        if (hasCompletedAppointment) {
            return Response.json(
                { error: "Customer visit has already been completed" },
                { status: 409 }
            );
        }

        // Every appointment block in the visit must be ready for checkout.
        // This prevents charging services that have not yet been performed.
        const allAppointmentsReady = visitAppointments.every(
            (visitAppointment) =>
                visitAppointment.status === "IN_PROGRESS" ||
                visitAppointment.status === "CHECKED_IN"
        );

        if (!allAppointmentsReady) {
            return Response.json(
                {
                    error:
                        "All services in this customer visit must be ready before checkout",
                },
                { status: 400 }
            );
        }

        // Save the entire checkout as one atomic database transaction.
        const sale = await prisma.$transaction(async (tx) => {
            // All appointments in this checkout share one service date.
            const serviceDate = visitAppointments[0].date;

            // Find the Monday of the service week using UTC calendar dates.
            const monday = new Date(serviceDate);

            const weekday = monday.getUTCDay();

            const daysSinceMonday =
                weekday === 0 ? 6 : weekday - 1;

            monday.setUTCDate(
                monday.getUTCDate() - daysSinceMonday
            );

            // Serialize checkout and payroll review for this service week.
            await lockPayrollWeek(tx, monday);

            // Lock appointment rows before validating financial ownership.
            // Under Serializable isolation, a concurrent technician change
            // must cause a safe serialization failure rather than stale checkout.
            const lockedAppointments = await tx.$queryRaw<
                { id: number }[]
            >`
                SELECT id
                FROM "Appointment"
                WHERE id IN (${Prisma.join(uniqueAppointmentIds)})
                ORDER BY id
                FOR UPDATE
            `;

            if (
                lockedAppointments.length !== uniqueAppointmentIds.length
            ) {
                throw new Error("CHECKOUT_VISIT_CHANGED");
            }

            // Reload the visit after acquiring the payroll-week lock.
            // Reject checkout if technician ownership or booked items changed.
            const currentVisitAppointments =
                await tx.appointment.findMany({
                    where: {
                        id: {
                            in: uniqueAppointmentIds,
                        },
                    },
                    select: {
                        id: true,
                        customerId: true,
                        employeeId: true,
                        bookingId: true,
                        date: true,
                        status: true,
                        startTime: true,
                        duration: true,
                        appointmentServices: {
                            select: {
                                serviceId: true,
                                bookedPrice: true,
                            },
                        },
                        appointmentAddons: {
                            select: {
                                addonId: true,
                                bookedPrice: true,
                            },
                        },
                    },
                });

            assertCheckoutVisitUnchanged(
                visitAppointments,
                currentVisitAppointments
            );

            // Recheck test fixture ownership after locking the appointments.
            // Never allow attributed testing on unrelated Development visits.
            if (
                usesAttributedCheckout &&
                    !allowAttributedProduction &&
                    !authorizeAttributedFixtureAppointments(
                    appointmentIds,
                    currentVisitAppointments
                )
            ) {
                throw new Error("TEST_FIXTURE_NOT_AUTHORIZED");
            }

            // Prevent duplicate sales before creating financial records.
            const existingSaleLinks =
                await tx.saleAppointment.count({
                    where: {
                        appointmentId: {
                            in: uniqueAppointmentIds,
                        },
                    },
                });

            if (existingSaleLinks > 0) {
                throw new Error("CHECKOUT_ALREADY_SOLD");
            }

            // Prevent checkout from changing reviewed or paid payroll.
            const lockedPeriod = await tx.payrollPeriod.findFirst({
                where: {
                    startDate: monday,
                    status: {
                        in: ["REVIEWED", "PAID"],
                    },
                },
                select: {
                    id: true,
                },
            });

            if (lockedPeriod) {
                throw new Error("PAYROLL_LOCKED");
            }

            // Prepare service-level financial attribution inside the
            // protected transaction, before creating any sale records.
            // The assignment payload remains disabled at the API boundary.
            const attributedCheckout =
                serviceAssignments !== undefined &&
                addonAssignments !== undefined
                    ? await validateAttributedCheckout(tx, {
                          appointmentIds: uniqueAppointmentIds,
                          services:
                              serviceAssignments as CheckoutServiceAssignment[],
                          addons:
                              addonAssignments as CheckoutAddonAssignment[],
                          selectedServiceIds: uniqueServiceIds,
                          // Preserve every selected occurrence for validation.
                          selectedAddonIds: addonIds,
                          servicePrices,
                          addonPrices,
                          discountTotal,
                          tips,
                      })
                    : null;

            // Both checkout modes must reconcile with the payment totals.
            if (
                attributedCheckout !== null &&
                (
                    attributedCheckout.subtotal !== subtotal ||
                    attributedCheckout.discountTotal !== discountTotal ||
                    attributedCheckout.finalTotal !== finalTotal
                )
            ) {
                throw new Error("CHECKOUT_TOTAL_MISMATCH");
            }

            // Select one consistent source for commissions and tips.
            const transactionFinancials =
                attributedCheckout !== null
                    ? selectCheckoutFinancials({
                          mode: "attributed",
                          financials: attributedCheckout,
                      })
                    : selectCheckoutFinancials({
                          mode: "legacy",
                          commissions: commissionsToCreate,
                          appointmentEmployeeIds: visitAppointments.map(
                              (appointment) => appointment.employeeId
                          ),
                      });

            const transactionCommissions =
                transactionFinancials.commissions;

            if (
                attributedCheckout !== null &&
                !allowAttributedCheckout
            ) {
                throw new Error("ASSIGNMENTS_NOT_ENABLED");
            }

            // Create the financial record for this checkout.
            const newSale = await tx.sale.create({
                data: {
                    subtotal,
                    discountTotal,
                    finalTotal,
                },
            });

            // An attributed checkout must have both validated assignment arrays.
            // Never silently write legacy line items for attributed commissions.
            if (transactionFinancials.mode === "attributed") {
                if (
                    !Array.isArray(serviceAssignments) ||
                    !Array.isArray(addonAssignments)
                ) {
                    throw new Error("CHECKOUT_ASSIGNMENT_MODE_MISMATCH");
                }
                await writeCheckoutLineItems(tx, {
                    mode: "attributed",
                    saleId: newSale.id,
                    services:
                        serviceAssignments as CheckoutServiceAssignment[],
                    addons:
                        addonAssignments as CheckoutAddonAssignment[],
                    catalogServices: services,
                    catalogAddons: addons,
                });
            } else {
                // Preserve the existing checkout format for legacy sales.
                await writeCheckoutLineItems(tx, {
                    mode: "legacy",
                    saleId: newSale.id,
                    items: [
                        ...services.map((service) => ({
                            itemType: "SERVICE",
                            itemId: service.id,
                            itemName: service.nameEs,
                            unitPrice:
                                submittedServicePrices.get(service.id) ?? 0,
                        })),

                        // Save every selected add-on occurrence independently.
                        ...addonPriceEntries.map((item) => {
                            const addon = addons.find(
                                (catalogItem) => catalogItem.id === item.addonId
                            );

                            if (!addon) {
                                throw new Error("CHECKOUT_ADDON_NOT_FOUND");
                            }

                            return {
                                itemType: "ADDON",
                                itemId: addon.id,
                                itemName: addon.nameEs,
                                unitPrice: item.price,
                            };
                        }),
                    ],
                });
            }

            // Connect every appointment block in this customer visit to the sale.
            await tx.saleAppointment.createMany({
                data: visitAppointments.map((visitAppointment) => ({
                    saleId: newSale.id,
                    appointmentId: visitAppointment.id,
                })),
            });

            // Save each payment method that actually received money
            await tx.payment.createMany({
                data: paymentsToCreate.map(
                    (payment: { paymentMethod: string; amount: number }) => ({
                        saleId: newSale.id,
                        paymentMethod: payment.paymentMethod,
                        amount: payment.amount,
                        processingFee:
                            payment.paymentMethod === "BOLD"
                                ? boldProcessingFee
                                : 0,
                    })
                ),
            });

            // Record what TEFF owes each technician who worked on this visit.
            if (transactionCommissions.length > 0) {
                await tx.commission.createMany({
                    data: transactionCommissions.map((commission) => ({
                        saleId: newSale.id,
                        employeeId: commission.employeeId,
                        commissionBase: commission.commissionBase,
                        commissionRate: commission.commissionRate,
                        commissionAmount: commission.commissionAmount,
                        status: "PENDING",
                    })),
                });
            }

            // Use the same validated financial mode for commissions and tips.
            const visitEmployeeIds = transactionFinancials.eligibleTipEmployees;

            const hasInvalidTipEmployee = tips.some(
                (tip: {
                    employeeId: number;
                    amount: number;
                    paymentMethod: string;
                }) => !visitEmployeeIds.has(tip.employeeId)
            );

            if (hasInvalidTipEmployee) {
                throw new Error("INVALID_TIP_EMPLOYEE");
            }

            // Record each technician's tip separately.
            if (tips.length > 0) {
                await tx.tip.createMany({
                    data: tips.map(
                        (tip: {
                            employeeId: number;
                            amount: number;
                            paymentMethod: string;
                        }) => ({
                            saleId: newSale.id,
                            employeeId: tip.employeeId,
                            amount: tip.amount,
                            paymentMethod: tip.paymentMethod,

                            // Cash tips are already in the technician's hands.
                            status:
                                tip.paymentMethod === "CASH"
                                    ? "PAID"
                                    : "PENDING",

                            paidAt:
                                tip.paymentMethod === "CASH"
                                    ? new Date()
                                    : null,
                        })
                    ),
                });
            }

            // Only complete the entire customer visit after the sale,
            // payments, and commissions have been recorded successfully.
            await tx.appointment.updateMany({
                where: {
                    id: {
                        in: uniqueAppointmentIds,
                    },
                },
                data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                },
            });

            // Return the sale and the commissions selected for this transaction.
            // The confirmation must reflect the amounts actually written.
            return {
                sale: newSale,
                commissionAmount: transactionCommissions.reduce(
                    (total, commission) =>
                        total + commission.commissionAmount,
                    0
                ),
            };
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
        });

        return Response.json(
            {
                success: true,
                saleId: sale.sale.id,
                finalTotal: sale.sale.finalTotal,
                commissionAmount: sale.commissionAmount,
            },
            { status: 201 }
        );

    } catch (error) {
        // Reject checkout if the locked appointments do not belong
        // to the authorized Development test fixture.
        if (
            error instanceof Error &&
            error.message === "TEST_FIXTURE_NOT_AUTHORIZED"
        ) {
            return Response.json(
                {
                    error:
                        "Esta cita no está autorizada para pruebas de asignación.",
                    conflictType: "TEST_FIXTURE_NOT_AUTHORIZED",
                },
                { status: 403 }
            );
        }
        if (
            error instanceof Error &&
            error.message === "CHECKOUT_VISIT_CHANGED"
        ) {
            return Response.json(
                {
                    error:
                        "La cita cambió mientras se procesaba el cobro. Actualiza la página y revisa los servicios y la técnica antes de continuar.",
                    conflictType: "CHECKOUT_VISIT_CHANGED",
                },
                { status: 409 }
            );
        }

        if (
            error instanceof Error &&
            error.message === "CHECKOUT_ALREADY_SOLD"
        ) {
            return Response.json(
                {
                    error:
                        "Esta cita ya tiene una venta registrada. No se puede cobrar nuevamente.",
                    conflictType: "CHECKOUT_ALREADY_SOLD",
                },
                { status: 409 }
            );
        }

        // The service week has already been reviewed or paid.
        if (
            error instanceof Error &&
            error.message === "PAYROLL_LOCKED"
        ) {
            return Response.json(
                {
                    error:
                        "No se puede completar esta venta porque la nómina de esa semana ya fue revisada o pagada.",
                    conflictType: "PAYROLL_LOCKED",
                },
                { status: 409 }
            );
        }

        // PostgreSQL detected a concurrent transaction conflict.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2034"
        ) {
            return Response.json(
                {
                    error:
                        "La nómina o la venta fue modificada al mismo tiempo. Inténtalo nuevamente.",
                },
                { status: 409 }
            );
        }
    if (
        error instanceof Error &&
        error.message === "INVALID_TIP_EMPLOYEE"
    ) {
        return Response.json(
            { error: "Tip recipient did not work on this customer visit" },
            { status: 400 }
        );
    }

    console.error("Check validation failed:", error);

    return Response.json(
        { error: "Unable to validate checkout" },
        { status: 500 }
    );
}
}