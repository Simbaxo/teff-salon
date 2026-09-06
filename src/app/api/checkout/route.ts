import { prisma } from "@/lib/prisma";
// Payment methods currently accepted by TEFF
const allowedPaymentMethods = ["CASH", "BOLD", "TRANSFER"];

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const {
            appointmentId,
            serviceIds,
            addonIds,
            discountTotal,
            payments,
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

        // Load the appointment and the techician assigned to it
        const appointment = await prisma.appointment.findUnique({
            where: {
                id: Number(appointmentId),
            },
            include: {
                employee: true,
            },
        });

        // Load the selected services from the database
        const services = await prisma.service.findMany({
            where: {
                id: {
                    in: serviceIds,
                },
                active: true,
            },
        });

        // Make sure every requested service actually exists and is active
        if (services.length !== serviceIds.length) {
            return Response.json(
                { error: "One or more services are invalid" },
                { status: 400 }
            );
        }

        // Load the selected add-ons from the database
        const addons = await prisma.addon.findMany({
            where: {
                id: {
                    in: uniqueAddonIds,
                },
                active: true,
            },
        });

        // Load the valid service/add-on relationships for the selected services
        const serviceAddonRelations = await prisma.serviceAddon.findMany({
            where: {
                serviceId: {
                    in: serviceIds,
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

        // Make sure every requested add-on actually exists and is active
        if (addons.length !== uniqueAddonIds.length) {
            return Response.json(
                { error: "One or more add-ons are invalid"},
                { status: 400 }
            );
        }

        // Calculate the authoritative service total using database prices
        const servicesTotal = services.reduce(
            (total, service) => total + service.price,
            0
        );

        // Calculate the authoritative add-on total using database prices
        const addonsTotal = addons.reduce(
            (total, addon) => total + addon.price,
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

        // Add all submitted payment amounts together
        const paymentTotal = payments.reduce(
            (
                total: number,
                payment: { paymentMethod: string;  amount: number }
            ) => total + payment.amount,
            0
        );

        if (paymentTotal !== finalTotal) {
            return Response.json(
                {
                    error: "Payments do not match final total",
                    finalTotal,
                    paymentTotal,
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

        if (!appointment) {
            return Response.json(
                { error: "Appointment not found" },
                { status: 400 }
            );
        }

        // Only appointments that reached the service stage can be checked out
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