import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("🔎 TEFF — Auditoría de Fechas de Servicio");
    console.log("----------------------------------------");
    console.log("Modo: SOLO LECTURA\n");

    // Load sales and their linked appointments and commissions.
    const sales = await prisma.sale.findMany({
        select: {
            id: true,
            createdAt: true,
            finalTotal: true,

            saleAppointments: {
                select: {
                    appointment: {
                        select: {
                            id: true,
                            date: true,
                            employeeId: true,
                            employee: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                },
            },

            commissions: {
                select: {
                    employeeId: true,
                    commissionBase: true,
                    commissionAmount: true,
                    employee: {
                        select: {
                            name: true,
                        },
                    },
                },
            },

            tips: {
                select: {
                    employeeId: true,
                    amount: true,
                },
            },
        },
        orderBy: {
            id: "asc",
        },
    });

    let mixedDateSales = 0;
    let ambiguousCommissions = 0;
    let ambiguousTips = 0;
    let missingAppointments = 0;
    let missingTechnicianAppointments = 0;

    for (const sale of sales) {
        const appointments = sale.saleAppointments.map(
            (item) => item.appointment
        );

        if (appointments.length === 0) {
            missingAppointments++;

            console.log(
                `⚠️ Venta #${sale.id}: sin citas asociadas`
            );

            continue;
        }

        // Appointment.date is a calendar date stored in UTC.
        const serviceDates = [
            ...new Set(
                appointments.map((appointment) =>
                    appointment.date
                        .toISOString()
                        .slice(0, 10)
                )
            ),
        ];

        if (serviceDates.length > 1) {
            mixedDateSales++;

            console.log(
                `\n⚠️ Venta #${sale.id}: múltiples fechas`
            );

            console.log(
                `   Fechas: ${serviceDates.join(", ")}`
            );
        }

        // Check each technician's dates independently.
        const employeeDates = new Map<number, Set<string>>();

        for (const appointment of appointments) {
            const date = appointment.date
                .toISOString()
                .slice(0, 10);

            if (!employeeDates.has(appointment.employeeId)) {
                employeeDates.set(
                    appointment.employeeId,
                    new Set()
                );
            }

            employeeDates.get(appointment.employeeId)!.add(date);
        }

        for (const commission of sale.commissions) {
            const dates = employeeDates.get(
                commission.employeeId
            );

            if (!dates || dates.size !== 1) {
                ambiguousCommissions++;

                console.log(
                    `⚠️ Venta #${sale.id}: comisión de ${commission.employee.name} sin fecha única`
                );
            }
        }

        for (const tip of sale.tips) {
            const dates = employeeDates.get(tip.employeeId);

            if (!dates || dates.size !== 1) {
                ambiguousTips++;

                console.log(
                    `⚠️ Venta #${sale.id}: propina de técnica #${tip.employeeId} sin fecha única`
                );
            }
        }

        // Check whether an appointment exists for every commissioned tech.
        const commissionedEmployeeIds = new Set(
            sale.commissions.map(
                (commission) => commission.employeeId
            )
        );

        for (const employeeId of commissionedEmployeeIds) {
            if (!employeeDates.has(employeeId)) {
                missingTechnicianAppointments++;
            }
        }
    }

    console.log("\n========================================");
    console.log("RESUMEN DE AUDITORÍA");
    console.log("========================================");

    console.log(`Ventas revisadas: ${sales.length}`);
    console.log(`Ventas con fechas mixtas: ${mixedDateSales}`);
    console.log(
        `Comisiones con fecha ambigua: ${ambiguousCommissions}`
    );
    console.log(
        `Propinas con fecha ambigua: ${ambiguousTips}`
    );
    console.log(
        `Ventas sin citas: ${missingAppointments}`
    );
    console.log(
        `Técnicas con comisión sin cita: ${missingTechnicianAppointments}`
    );

    if (
        mixedDateSales === 0 &&
        ambiguousCommissions === 0 &&
        ambiguousTips === 0 &&
        missingAppointments === 0 &&
        missingTechnicianAppointments === 0
    ) {
        console.log(
            "\n✅ No se detectaron problemas de atribución de fechas."
        );
    } else {
        console.log(
            "\n⚠️ Hay registros que deben revisarse antes de usar Nómina."
        );
    }
}

main()
    .catch((error) => {
        console.error("Error en auditoría:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });