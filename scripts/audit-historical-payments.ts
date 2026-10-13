
import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("🔎 TEFF — Auditoría de Pagos Históricos");
    console.log("----------------------------------------");
    console.log("Modo: SOLO LECTURA\n");

    // Count payments already recorded in historical reconciliation.
    const count = await prisma.payrollHistoricalPayment.count();

    console.log(`Pagos históricos encontrados: ${count}`);

    if (count === 0) {
        console.log("✅ No existen pagos históricos registrados.");
        console.log("La tabla está lista para agregar la clave única.");
    } else {
        console.log("⚠️ Existen pagos históricos.");
        console.log("Se requiere revisar los registros antes de migrar.");
    }
}

main()
    .catch((error) => {
        console.error("❌ Error en auditoría:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });