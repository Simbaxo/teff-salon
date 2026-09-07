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
            serviceIds,
            addonIds,
            discountTotal,
            payments,
            tipAmount,
            tipPaymentMethod,
        } = body;

        // Make sure the checkout contains the basic required information
        if (
            !appointmentId ||
            !Array.isArray(serviceIds) ||
            serviceIds.length === 0 ||
            !Array.isArray(addonIds) ||
            !Array.isArray(payments)
        ) {
            return Response.json(
                { error: "Invalid checkout information"},
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

        // Tip must be a whole, non-negative COP amount
        if (!Number.isInteger(tipAmount) || tipAmount < 0) {
            return Response.json(
                { error: "Invalid tip amount" },
                { status: 400 }
            );
        }

        // A payment method is only required when there is a tip
        if (
            tipAmount > 0 &&
            !allowedPaymentMethods.includes(tipPaymentMethod)
        ) {
            return Response.json(
                { error: "Invalid tip payment method" },
                { status: 400 }
            );
        }

        // Load the appointment and the technician assigned to it
        const appointment = await prisma.appointment.findUnique({
            where: {
                id: Number(appointmentId),
            },
            include: {
                employee: true,

                // Load the original booking snapshots so we can honor booked prices
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

        // Stop checkout if the appointment does not exist
        if (!appointment) {
            return Response.json(
                { error: "Appointment not found" },
                { status: 404 }
            );
        }

        // Remember the prices the customer was originally quoted
        const bookedServicePrices = new Map(
            appointment.appointmentServices.map((item) => [
                item.serviceId,
                item.bookedPrice,
            ])
        );

        const bookedAddonPrices = new Map(
            appointment.appointmentAddons.map((item) => [
                item.addonId,
                item.bookedPrice,
            ])
        )

        // Load all selected services, including inactive ones.
        // Previously booked services must still be honored at checkout
        const services = await prisma.service.findMany({
            where: {
                id: {
                    in: uniqueServiceIds,
                },
                active: true,
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

        // Reject add-ons that do not belong to any selected services
        const hasInvalidAddon = uniqueAddonIds.some(
            (addonId: number) => !allowedAddonIds.has(addonId)
        );

        if (hasInvalidAddon) {
            return Response.json(
                { error: "One or more add-ons are not valid for the selected services"},
                { status: 400 }
            );
        }

        // Load the services this technician is qualified to perform
        const employeeServices = await prisma.employeeService.findMany({
            where: {
                employeeId: appointment.employeeId,
            },
        });

        const employeeServiceIds = new Set(
            employeeServices.map((item) => item.serviceId)
        );

        // Make sure the assigned technician can perform every selected service
        const hasUnsupportedService = uniqueServiceIds.some(
            (serviceId: number) => !employeeServiceIds.has(serviceId)
        );

        if (hasUnsupportedService) {
            return Response.json(
                { error: "Technician is not qualified for one or more services" },
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

        // Add all submitted payment amounts together
        const paymentTotal = payments.reduce(
            (
                total: number,
                payment: { paymentMethod: string;  amount: number }
            ) => total + payment.amount,
            0
        );

        // Cash tips go directly to the technician
        // Electronic tips are collected by TEFF
        const electronicTip =
            tipPaymentMethod === "CASH" ? 0 : tipAmount;
        
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

        // The technician's commission is based on the final discounted amount
        const commissionBase = finalTotal;

        // Temporary default until commission rates are stored per employee
        const commissionRate = 50;

        // Calculate the technician's commission in whole COP
        const commissionAmount = Math.round(
            commissionBase * (commissionRate /100)
        );

        // Prevent a completed appointment from being sold again
        if (appointment.status === "COMPLETED") {
            return Response.json(
                { error: "Appointment has already been completed" },
                { status: 409 }
            );
        }

        // Only active appointments can continue to checkout
        if (
            appointment.status !== "IN_PROGRESS" &&
            appointment.status !== "CHECKED_IN"
        ) {
            return Response.json(
                { error: "Appointment is not ready for checkout" },
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

            // Connect this appointment to the sale
            await tx.saleAppointment.create({
                data: {
                    saleId: newSale.id,
                    appointmentId: appointment.id,
                },
            });

            // Save each payment method that actually received money
            await tx.payment.createMany({
                data: paymentsToCreate.map(
                    (payment: { paymentMethod: string; amount: number }) => ({
                        saleId: newSale.id,
                        paymentMethod: payment.paymentMethod,
                        amount: payment.amount,
                        processingFee: 0,
                    })
                ),
            });

            // Record what TEFF owes the technician for this sale
            await tx.commission.create({
                data: {
                    saleId: newSale.id,
                    employeeId: appointment.employeeId,
                    commissionBase,
                    commissionRate,
                    commissionAmount,
                    status: "PENDING",
                },
            });

            // Save the tip only when the customer actually leaves one
            if (tipAmount > 0) {
                await tx.tip.create({
                    data: {
                        saleId: newSale.id,
                        employeeId: appointment.employeeId,
                        amount: tipAmount,
                        paymentMethod: tipPaymentMethod,

                        // Cash tips are assumed to be handed directly to the technician
                        status: tipPaymentMethod === "CASH" ? "PAID" : "PENDING",

                        // Record when a cash tip was already received
                        paidAt: tipPaymentMethod === "CASH" ? new Date() : null
                    },
                });
            }

            // Only mark the appointment complete after the sale is recorded
            await tx.appointment.update({
                where: {
                    id: appointment.id,
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
                commissionAmount,
            },
            { status: 201 }
        );

    } catch (error) {
        console.error("Check validation failed:", error)

        return Response.json(
            { error: "Unable to validate checkout" },
            { status: 500 }
        );
    }
}