import { auth } from "@/auth";
import { canCheckout } from "@/lib/auth-roles";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { getTeffToday } from "@/lib/datetime";

type HistoricalServiceInput = {
    serviceId: number;
    employeeId: number;
    price: number;
};

type HistoricalAddonInput = {
    addonId: number;
    serviceId: number;
    price: number;
};

type HistoricalPaymentInput = {
    paymentMethod: string;
    amount: number;
};

type HistoricalTipInput = {
    employeeId: number;
    amount: number;
    paymentMethod: string;
};

const allowedPaymentMethods = ["CASH", "BOLD", "TRANSFER"];

export async function POST(request: Request) {
    const session = await auth();

    // Historical financial entry is restricted to users who may checkout.
    if (!session?.user) {
        return Response.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    if (!canCheckout(session.user.role)) {
        return Response.json(
            { error: "Forbidden" },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();

        const {
            customerName,
            customerPhone,
            customerEmail,
            customerNotes,
            date,
            startTime,
            services,
            addons,
            discountTotal,
            payments,
            tips,
        } = body;

        if (
            typeof customerName !== "string" ||
            typeof customerPhone !== "string" ||
            typeof date !== "string" ||
            typeof startTime !== "string" ||
            !Array.isArray(services) ||
            services.length === 0 ||
            !Array.isArray(addons) ||
            !Array.isArray(payments) ||
            !Array.isArray(tips)
        ) {
            return Response.json(
                { error: "Invalid historical sale information" },
                { status: 400 }
            );
        }

        const normalizedCustomerName = customerName.trim();
        const normalizedCustomerPhone =
            customerPhone.trim()
                ? normalizePhoneNumber(
                    customerPhone
                )
                : null;

        const normalizedCustomerEmail =
            typeof customerEmail === "string"
                ? customerEmail.trim()
                : "";

        const normalizedCustomerNotes =
            typeof customerNotes === "string"
                ? customerNotes.trim()
                : "";

        if (!normalizedCustomerName) {
            return Response.json(
                { error: "Invalid customer information" },
                { status: 400 }
            );
        }

        // Historical entries may be today or in the past, never in the future.
        const dateMatch =
            /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

        const isValidStartTime =
            /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime);

        if (!dateMatch || !isValidStartTime) {
            return Response.json(
                { error: "Invalid historical date or time" },
                { status: 400 }
            );
        }

        const year = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const day = Number(dateMatch[3]);

        const parsedDate = new Date(
            Date.UTC(year, month - 1, day)
        );

        const isValidDate =
            parsedDate.getUTCFullYear() === year &&
            parsedDate.getUTCMonth() === month - 1 &&
            parsedDate.getUTCDate() === day;

        if (!isValidDate || date > getTeffToday()) {
            return Response.json(
                {
                    error:
                        "Historical date must be today or earlier",
                },
                { status: 400 }
            );
        }

        // Store the real historical service time as an absolute timestamp.
        // Medellín uses UTC-5 year-round.
        const historicalTimestamp = new Date(
            `${date}T${startTime}:00-05:00`
        );

        if (Number.isNaN(historicalTimestamp.getTime())) {
            return Response.json(
                { error: "Invalid historical timestamp" },
                { status: 400 }
            );
        }

        const historicalDate = new Date(
            `${date}T00:00:00.000Z`
        );

        const serviceInputs =
            services as HistoricalServiceInput[];

        const addonInputs =
            addons as HistoricalAddonInput[];

        const paymentInputs =
            payments as HistoricalPaymentInput[];

        const tipInputs =
            tips as HistoricalTipInput[];

        // Validate services entered by staff.
        const servicesAreValid = serviceInputs.every(
            (item) =>
                Number.isInteger(item.serviceId) &&
                item.serviceId > 0 &&
                Number.isInteger(item.employeeId) &&
                item.employeeId > 0 &&
                Number.isInteger(item.price) &&
                item.price >= 0
        );

        // Validate add-ons and the service each add-on belongs to.
        const addonsAreValid = addonInputs.every(
            (item) =>
                Number.isInteger(item.addonId) &&
                item.addonId > 0 &&
                Number.isInteger(item.serviceId) &&
                item.serviceId > 0 &&
                Number.isInteger(item.price) &&
                item.price >= 0
        );

        if (!servicesAreValid || !addonsAreValid) {
            return Response.json(
                { error: "Invalid historical line items" },
                { status: 400 }
            );
        }

        const serviceIds = serviceInputs.map(
            (item) => item.serviceId
        );

        const addonIds = addonInputs.map(
            (item) => item.addonId
        );

        const uniqueServiceIds = [...new Set(serviceIds)];
        const uniqueAddonIds = [...new Set(addonIds)];

        if (
            uniqueServiceIds.length !== serviceIds.length ||
            uniqueAddonIds.length !== addonIds.length
        ) {
            return Response.json(
                {
                    error:
                        "Historical sale contains duplicate services or add-ons",
                },
                { status: 400 }
            );
        }

        const catalogServices = await prisma.service.findMany({
            where: {
                id: {
                    in: uniqueServiceIds,
                },
            },
        });

        if (catalogServices.length !== uniqueServiceIds.length) {
            return Response.json(
                { error: "One or more services do not exist" },
                { status: 400 }
            );
        }

        const catalogAddons = await prisma.addon.findMany({
            where: {
                id: {
                    in: uniqueAddonIds,
                },
            },
        });

        if (catalogAddons.length !== uniqueAddonIds.length) {
            return Response.json(
                { error: "One or more add-ons do not exist" },
                { status: 400 }
            );
        }

        const employeeIds = [
            ...new Set(
                serviceInputs.map((item) => item.employeeId)
            ),
        ];

        const employeeServices =
            await prisma.employeeService.findMany({
                where: {
                    employeeId: {
                        in: employeeIds,
                    },
                    serviceId: {
                        in: uniqueServiceIds,
                    },
                },
            });

        const hasInvalidQualification = serviceInputs.some(
            (item) =>
                !employeeServices.some(
                    (relation) =>
                        relation.employeeId === item.employeeId &&
                        relation.serviceId === item.serviceId
                )
        );

        if (hasInvalidQualification) {
            return Response.json(
                {
                    error:
                        "One or more technicians are not qualified for the selected services",
                },
                { status: 400 }
            );
        }

        const serviceAddonRelations =
            await prisma.serviceAddon.findMany({
                where: {
                    serviceId: {
                        in: uniqueServiceIds,
                    },
                    addonId: {
                        in: uniqueAddonIds,
                    },
                },
            });

        const hasInvalidAddonRelation = addonInputs.some(
            (item) =>
                !serviceAddonRelations.some(
                    (relation) =>
                        relation.serviceId === item.serviceId &&
                        relation.addonId === item.addonId
                )
        );

        if (hasInvalidAddonRelation) {
            return Response.json(
                {
                    error:
                        "One or more add-ons are not valid for the selected services",
                },
                { status: 400 }
            );
        }

        // Each historical service becomes its own completed appointment block.
        const serviceBlocks = serviceInputs.map((serviceInput) => {
            const service = catalogServices.find(
                (item) => item.id === serviceInput.serviceId
            );

            if (!service) {
                throw new Error("Missing historical service");
            }

            const assignedAddonInputs = addonInputs.filter(
                (addon) =>
                    addon.serviceId === serviceInput.serviceId
            );

            const assignedAddons = assignedAddonInputs.map(
                (addonInput) => {
                    const addon = catalogAddons.find(
                        (item) => item.id === addonInput.addonId
                    );

                    if (!addon) {
                        throw new Error("Missing historical add-on");
                    }

                    return {
                        addon,
                        price: addonInput.price,
                    };
                }
            );

            const duration =
                service.estimatedDuration +
                assignedAddons.reduce(
                    (total, item) =>
                        total + item.addon.estimatedDuration,
                    0
                );

            return {
                service,
                employeeId: serviceInput.employeeId,
                price: serviceInput.price,
                addons: assignedAddons,
                duration,
            };
        });

        // Historical prices are the actual prices charged for this visit.
        const servicesTotal = serviceInputs.reduce(
            (total, item) => total + item.price,
            0
        );

        const addonsTotal = addonInputs.reduce(
            (total, item) => total + item.price,
            0
        );

        const subtotal = servicesTotal + addonsTotal;

        if (
            !Number.isInteger(discountTotal) ||
            discountTotal < 0 ||
            discountTotal > subtotal
        ) {
            return Response.json(
                { error: "Invalid historical discount" },
                { status: 400 }
            );
        }

        const finalTotal = subtotal - discountTotal;

        if (finalTotal <= 0) {
            return Response.json(
                {
                    error:
                        "Historical sale total must be greater than zero",
                },
                { status: 400 }
            );
        }

        const paymentsAreValid = paymentInputs.every(
            (payment) =>
                allowedPaymentMethods.includes(
                    payment.paymentMethod
                ) &&
                Number.isInteger(payment.amount) &&
                payment.amount > 0
        );

        if (!paymentsAreValid) {
            return Response.json(
                { error: "Invalid historical payment information" },
                { status: 400 }
            );
        }

        const paymentMethods = paymentInputs.map(
            (payment) => payment.paymentMethod
        );

        if (
            new Set(paymentMethods).size !==
            paymentMethods.length
        ) {
            return Response.json(
                {
                    error:
                        "Historical sale contains duplicate payment methods",
                },
                { status: 400 }
            );
        }

        const tipsAreValid = tipInputs.every(
            (tip) =>
                Number.isInteger(tip.employeeId) &&
                tip.employeeId > 0 &&
                Number.isInteger(tip.amount) &&
                tip.amount > 0 &&
                allowedPaymentMethods.includes(
                    tip.paymentMethod
                )
        );

        if (!tipsAreValid) {
            return Response.json(
                { error: "Invalid historical tip information" },
                { status: 400 }
            );
        }

        const visitEmployeeIds = new Set(employeeIds);

        const hasInvalidTipEmployee = tipInputs.some(
            (tip) => !visitEmployeeIds.has(tip.employeeId)
        );

        if (hasInvalidTipEmployee) {
            return Response.json(
                {
                    error:
                        "Historical tip belongs to a technician outside this visit",
                },
                { status: 400 }
            );
        }

        const electronicTipTotal = tipInputs.reduce(
            (total, tip) =>
                tip.paymentMethod === "CASH"
                    ? total
                    : total + tip.amount,
            0
        );

        const paymentTotal = paymentInputs.reduce(
            (total, payment) =>
                total + payment.amount,
            0
        );

        const expectedPaymentTotal =
            finalTotal + electronicTipTotal;

        if (paymentTotal !== expectedPaymentTotal) {
            return Response.json(
                {
                    error:
                        "Historical payments do not match the amount due",
                },
                { status: 400 }
            );
        }

        const revenueByEmployee = new Map<number, number>();

        for (const serviceInput of serviceInputs) {
            const current =
                revenueByEmployee.get(
                    serviceInput.employeeId
                ) ?? 0;

            revenueByEmployee.set(
                serviceInput.employeeId,
                current + serviceInput.price
            );
        }

        for (const addonInput of addonInputs) {
            const parentService = serviceInputs.find(
                (service) =>
                    service.serviceId ===
                    addonInput.serviceId
            );

            if (!parentService) {
                return Response.json(
                    {
                        error:
                            "Historical add-on has no matching service",
                    },
                    { status: 400 }
                );
            }

            const current =
                revenueByEmployee.get(
                    parentService.employeeId
                ) ?? 0;

            revenueByEmployee.set(
                parentService.employeeId,
                current + addonInput.price
            );
        }

        const attributedRevenueTotal = Array.from(
            revenueByEmployee.values()
        ).reduce(
            (total, amount) => total + amount,
            0
        );

        if (attributedRevenueTotal !== subtotal) {
            return Response.json(
                {
                    error:
                        "Historical revenue could not be fully attributed to technicians",
                },
                { status: 400 }
            );
        }

        const commissionRate = 50;

        let remainingDiscount = discountTotal;

        const employeeRevenueEntries = Array.from(
            revenueByEmployee.entries()
        );

        const commissionsToCreate =
            employeeRevenueEntries.map(
                ([employeeId, revenue], index) => {
                    let allocatedDiscount = 0;

                    if (
                        discountTotal > 0 &&
                        subtotal > 0
                    ) {
                        const isLast =
                            index ===
                            employeeRevenueEntries.length - 1;

                        allocatedDiscount = isLast
                            ? remainingDiscount
                            : Math.round(
                                discountTotal *
                                    (revenue / subtotal)
                            );

                        allocatedDiscount = Math.min(
                            allocatedDiscount,
                            remainingDiscount,
                            revenue
                        );

                        remainingDiscount -=
                            allocatedDiscount;
                    }

                    const commissionBase =
                        revenue - allocatedDiscount;

                    return {
                        employeeId,
                        commissionBase,
                        commissionRate,
                        commissionAmount: Math.round(
                            commissionBase *
                                (commissionRate / 100)
                        ),
                    };
                }
            );

        const totalCommissionBase =
            commissionsToCreate.reduce(
                (total, commission) =>
                    total + commission.commissionBase,
                0
            );

        if (totalCommissionBase !== finalTotal) {
            return Response.json(
                {
                    error:
                        "Historical commission attribution does not match final sale total",
                },
                { status: 400 }
            );
        }

        const result = await prisma.$transaction(async (tx) => {
            /*
            * Reuse an existing customer when a phone number is provided.
            * Without a phone number, create a new customer record.
            */
            const customer = normalizedCustomerPhone
                ? await tx.customer.upsert({
                    where: {
                        phone: normalizedCustomerPhone,
                    },
                    update: {
                        name: normalizedCustomerName,
                        email:
                            normalizedCustomerEmail ||
                            null,
                    },
                    create: {
                        name: normalizedCustomerName,
                        phone: normalizedCustomerPhone,
                        email:
                            normalizedCustomerEmail ||
                            null,
                    },
                })
                : await tx.customer.create({
                    data: {
                        name: normalizedCustomerName,
                        phone: null,
                        email:
                            normalizedCustomerEmail ||
                            null,
                    },
                });

            // One Booking represents the complete historical salon visit.
            const booking = await tx.booking.create({
                data: {
                    customerId: customer.id,
                    date: historicalDate,
                    notes: normalizedCustomerNotes || null,
                    createdAt: historicalTimestamp,
                },
            });

            function timeToMinutes(time: string) {
                const [hours, minutes] =
                    time.split(":").map(Number);

                return hours * 60 + minutes;
            }

            function minutesToTime(minutes: number) {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;

                return `${hours
                    .toString()
                    .padStart(2, "0")}:${mins
                    .toString()
                    .padStart(2, "0")}`;
            }

            let blockStart = timeToMinutes(startTime);

            const createdAppointments = [];

            // Historical services are stored sequentially just like normal bookings.
            for (const block of serviceBlocks) {
                const blockStartTime = minutesToTime(blockStart);

                const blockTimestamp = new Date(
                    `${date}T${blockStartTime}:00-05:00`
                );

                const blockCompletedTimestamp = new Date(
                    blockTimestamp.getTime() +
                        block.duration * 60_000
                );

                const appointment =
                    await tx.appointment.create({
                        data: {
                            bookingId: booking.id,
                            customerId: customer.id,
                            employeeId: block.employeeId,
                            date: historicalDate,
                            startTime: blockStartTime,
                            duration: block.duration,
                            status: "COMPLETED",
                            notes:
                                normalizedCustomerNotes || null,

                            createdAt: historicalTimestamp,
                            checkedInAt: blockTimestamp,
                            startedAt: blockTimestamp,
                            completedAt: blockCompletedTimestamp,

                            appointmentServices: {
                                create: {
                                    serviceId: block.service.id,
                                    bookedPrice: block.price,
                                    bookedDuration:
                                        block.service
                                            .estimatedDuration,
                                },
                            },

                            appointmentAddons: {
                                create: block.addons.map(
                                    (item) => ({
                                        addonId: item.addon.id,
                                        bookedPrice: item.price,
                                        bookedDuration:
                                            item.addon
                                                .estimatedDuration,
                                    })
                                ),
                            },
                        },
                    });

                createdAppointments.push(appointment);

                blockStart += block.duration;
            }

            // Create the historical financial record.
            const sale = await tx.sale.create({
                data: {
                    subtotal,
                    discountTotal,
                    finalTotal,
                    createdAt: historicalTimestamp,
                },
            });

            // Link the complete historical visit to the sale.
            await tx.saleAppointment.createMany({
                data: createdAppointments.map(
                    (appointment) => ({
                        saleId: sale.id,
                        appointmentId: appointment.id,
                    })
                ),
            });

            // Preserve exactly what was sold and at what price.
            await tx.saleLineItem.createMany({
                data: [
                    ...serviceInputs.map((serviceInput) => {
                        const service =
                            catalogServices.find(
                                (item) =>
                                    item.id ===
                                    serviceInput.serviceId
                            )!;

                        return {
                            saleId: sale.id,
                            itemType: "SERVICE",
                            itemId: service.id,
                            itemName: service.nameEs,
                            unitPrice: serviceInput.price,
                        };
                    }),

                    ...addonInputs.map((addonInput) => {
                        const addon =
                            catalogAddons.find(
                                (item) =>
                                    item.id === addonInput.addonId
                            )!;

                        return {
                            saleId: sale.id,
                            itemType: "ADDON",
                            itemId: addon.id,
                            itemName: addon.nameEs,
                            unitPrice: addonInput.price,
                        };
                    }),
                ],
            });

            // Save historical payments using the historical transaction time.
            await tx.payment.createMany({
                data: paymentInputs.map((payment) => ({
                    saleId: sale.id,
                    paymentMethod: payment.paymentMethod,
                    amount: payment.amount,
                    processingFee: 0,
                    createdAt: historicalTimestamp,
                })),
            });

            // Create technician commissions from the discounted attributed revenue.
            await tx.commission.createMany({
                data: commissionsToCreate.map(
                    (commission) => ({
                        saleId: sale.id,
                        employeeId: commission.employeeId,
                        commissionBase:
                            commission.commissionBase,
                        commissionRate:
                            commission.commissionRate,
                        commissionAmount:
                            commission.commissionAmount,
                        status: "PENDING",
                        createdAt: historicalTimestamp,
                    })
                ),
            });

            // Store historical tips separately from salon revenue.
            if (tipInputs.length > 0) {
                await tx.tip.createMany({
                    data: tipInputs.map((tip) => ({
                        saleId: sale.id,
                        employeeId: tip.employeeId,
                        amount: tip.amount,
                        paymentMethod: tip.paymentMethod,

                        // Cash tips were already handed directly to the technician.
                        status:
                            tip.paymentMethod === "CASH"
                                ? "PAID"
                                : "PENDING",

                        paidAt:
                            tip.paymentMethod === "CASH"
                                ? historicalTimestamp
                                : null,

                        createdAt: historicalTimestamp,
                    })),
                });
            }

            return {
                saleId: sale.id,
                bookingId: booking.id,
                appointmentIds:
                    createdAppointments.map(
                        (appointment) => appointment.id
                    ),
                finalTotal: sale.finalTotal,
            };
        });

        return Response.json(
            {
                ...result,
                message:
                    "Historical appointment and sale registered successfully",
            },
            { status: 201 }
        );
    } catch (error) {
        console.error(
            "Failed to create historical sale:",
            error
        );

        return Response.json(
            { error: "Unable to create historical sale" },
            { status: 500 }
        );
    }
}