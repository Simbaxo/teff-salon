import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { canCheckout } from "@/lib/auth-roles";

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
            discountTotal,
            payments,
            tips,
        } = body;

        // Make sure the checkout contains the basic required information
        if (
            !appointmentId ||
            !Array.isArray(appointmentIds) ||
            appointmentIds.length === 0 ||
            !Array.isArray(serviceIds) ||
            serviceIds.length === 0 ||
            !Array.isArray(addonIds) ||
            !Array.isArray(payments) ||
            !Array.isArray(tips)
        ) {
            return Response.json(
                { error: "Invalid checkout information"},
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

        // Only newly added add-ons must must the current service/add-on rules
        const newAddonIds = uniqueAddonIds.filter(
            (addonId) => !bookedAddonPrices.has(addonId)
        );

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

        if (hasUnsupportedService) {
            return Response.json(
                {
                    error:
                        "No technician on this visit is qualified for one or more added services",
                },
                { status: 400 }
            );
        }

        // Newly added checkout items need explicit technician attribution.
        // A single-technician visit is unambiguous. For multi-technician visits,
        // do not guess which technician performed an item added during checkout.
        const hasNewCheckoutItems =
            newServiceIds.length > 0 || newAddonIds.length > 0;

        if (hasNewCheckoutItems && visitEmployeeIds.length > 1) {
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

        // An inactive add-on is allowed only if it was part of the original booking
        const hasInvalidInactiveAddon = addons.some(
            (addon) =>
                !addon.active &&
                !bookedAddonPrices.has(addon.id)
        );

        if (hasInvalidInactiveAddon) {
            return Response.json(
                { error: "An inactive add-on cannot be added during checkout" },
                { status: 400 }
            );
        }

        // Use the booked price when the service was part of the original appointment
        // Newly added services use today's menu price.
        const servicesTotal = services.reduce((total, service) => {
            const price =
                bookedServicePrices.get(service.id) ?? service.price;

            return total + price;
        }, 0);

        // Original add-ons keep their booked price
        // Add-ons added durning checkout use today's menu price.
        const addonsTotal = addons.reduce((total, addon) => {
            const price =
                bookedAddonPrices.get(addon.id) ?? addon.price;
            
            return total + price;
        }, 0);

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

                            return total + item.bookedPrice;
                        },
                        0
                    );

                const addonRevenue =
                    visitAppointment.appointmentAddons.reduce(
                        (total, item) => {
                            // Only include add-ons that remain in the final checkout.
                            if (!uniqueAddonIds.includes(item.addonId)) {
                                return total;
                            }

                            return total + item.bookedPrice;
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
                    (total, service) => total + service.price,
                    0
                );

            const addedAddonRevenue = addons
                .filter((addon) => newAddonIds.includes(addon.id))
                .reduce(
                    (total, addon) => total + addon.price,
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

        const appointmentCommissionBases = appointmentRevenue.map(
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

        const commissionsToCreate = Array.from(
            commissionByEmployee.entries()
        ).map(([employeeId, commissionBase]) => ({
            employeeId,
            commissionBase,
            commissionRate,
            commissionAmount: Math.round(
                commissionBase * (commissionRate / 100)
            ),
        }));

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

        // Save the entire checkout as one atomic database transaction
        const sale = await prisma.$transaction(async (tx) => {
            // Create the financial record for this checkout
            const newSale = await tx.sale.create({
                data: {
                    subtotal,
                    discountTotal,
                    finalTotal,
                },
            });

            // Save a permanent snapshot of the services actually sold
            await tx.saleLineItem.createMany({
                data: [
                    ...services.map((service) => ({
                        saleId: newSale.id,
                        itemType: "SERVICE",
                        itemId: service.id,
                        itemName: service.nameEs,
                        unitPrice: 
                            bookedServicePrices.get(service.id) ?? service.price,
                    })),

                    // Save a permanent snapshot of the add-ons actually sold
                    ...addons.map((addon) => ({
                        saleId: newSale.id,
                        itemType: "ADDON",
                        itemId: addon.id,
                        itemName: addon.nameEs,
                        unitPrice: 
                            bookedAddonPrices.get(addon.id) ?? addon.price,
                    })),
                ],
            });

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
            if (commissionsToCreate.length > 0) {
                await tx.commission.createMany({
                    data: commissionsToCreate.map((commission) => ({
                        saleId: newSale.id,
                        employeeId: commission.employeeId,
                        commissionBase: commission.commissionBase,
                        commissionRate: commission.commissionRate,
                        commissionAmount: commission.commissionAmount,
                        status: "PENDING",
                    })),
                });
            }

            // Only technicians who actually worked on this visit may receive tips.
            const visitEmployeeIds = new Set(
                visitAppointments.map(
                    (visitAppointment) => visitAppointment.employeeId
                )
            );

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

            return newSale;
        })

        // Tell the checkout UI that the sale was saved successfully
        return Response.json(
            {
                success: true,
                saleId: sale.id,
                finalTotal: sale.finalTotal,
                commissionAmount: commissionsToCreate.reduce(
                    (total, commission) =>
                        total + commission.commissionAmount,
                    0
                ),
            },
            { status: 201 }
        );

    } catch (error) {
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