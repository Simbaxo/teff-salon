
import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("🔎 TEFF — Auditoría de Nómina");
    console.log("Modo: SOLO LECTURA\n");

    const entries = await prisma.payrollEntry.findMany({
        select: {
            id: true,
            employeeId: true,
            netPay: true,
            status: true,
            employee: {
                select: {
                    name: true,
                },
            },
            period: {
                select: {
                    startDate: true,
                },
            },
        },
        take: 10,
        orderBy: {
            id: "asc",
        },
    });

    console.table(
        entries.map((entry) => ({
            entryId: entry.id,
            tecnica: entry.employee.name,
            semana: entry.period.startDate
                .toISOString()
                .slice(0, 10),
            pagoNetoGuardado: entry.netPay,
            estado: entry.status,
        }))
    );

    console.log(
        `\nComprobantes encontrados: ${entries.length}`
    );
}

main()
    .catch((error) => {
        console.error("❌ Error en auditoría:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });