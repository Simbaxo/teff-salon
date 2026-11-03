import { readFile } from "node:fs/promises";
import { Prisma, PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";
import { lockCashbox } from "../../../src/lib/cashbox/lock";
import { lockPayrollWeek } from "../../../src/lib/payroll/period-lock";

type Fixture = {
  marker: string;
  week: string;
  ownerId: number;
  employeeId: number;
  customerId: number;
  appointmentId: number;
  saleId: number;
  lineItemId: number;
  commissionId: number;
  paymentId: number;
  expectedCommission: number;
  expectedLoan: number;
};

function requireSafe(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(`STOP: ${message}`);
  }
}

async function main() {
  const manifestPath = process.argv[2];
  const mode = process.argv[3];

  requireSafe(
    mode === undefined || mode === "--delete",
    "Invalid cleanup mode",
  );

  requireSafe(
    typeof manifestPath === "string" &&
      /^\.teff-test-fixtures\/cashbox-teff-cashbox-[0-9a-f-]{36}\.json$/.test(
        manifestPath,
      ),
    "Invalid fixture manifest path",
  );

  const fixture = JSON.parse(await readFile(manifestPath, "utf8")) as Fixture;

  requireSafe(
    /^teff-cashbox-[0-9a-f-]{36}$/.test(fixture.marker) &&
      manifestPath === `.teff-test-fixtures/cashbox-${fixture.marker}.json`,
    "Fixture identity mismatch",
  );

  requireSafe(
    /^\d{4}-\d{2}-\d{2}$/.test(fixture.week) &&
      Number.isSafeInteger(fixture.ownerId) &&
      fixture.ownerId === 1 &&
      [
        fixture.employeeId,
        fixture.customerId,
        fixture.appointmentId,
        fixture.saleId,
        fixture.lineItemId,
        fixture.commissionId,
        fixture.paymentId,
      ].every((id) => Number.isSafeInteger(id) && id > 0) &&
      fixture.expectedCommission === 150000 &&
      fixture.expectedLoan === 50000,
    "Unexpected fixture data",
  );

  const startDate = new Date(`${fixture.week}T00:00:00.000Z`);

  requireSafe(
    !Number.isNaN(startDate.getTime()) &&
      startDate.toISOString().slice(0, 10) === fixture.week &&
      startDate.getUTCDay() === 1,
    "Invalid payroll week",
  );

  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const deleteRequested = mode === "--delete";

  try {
    await prisma.$transaction(
      async (tx) => {
        await lockPayrollWeek(tx, startDate);
        await lockCashbox(tx);

        const [
          employee,
          customer,
          appointment,
          sale,
          lineItem,
          commission,
          payment,
          entries,
          movements,
        ] = await Promise.all([
          tx.employee.findUnique({
            where: { id: fixture.employeeId },
          }),
          tx.customer.findUnique({
            where: { id: fixture.customerId },
          }),
          tx.appointment.findUnique({
            where: { id: fixture.appointmentId },
          }),
          tx.sale.findUnique({
            where: { id: fixture.saleId },
            include: {
              saleAppointments: true,
              lineItems: true,
              payments: true,
              commissions: true,
              tips: true,
            },
          }),
          tx.saleLineItem.findUnique({
            where: { id: fixture.lineItemId },
          }),
          tx.commission.findUnique({
            where: { id: fixture.commissionId },
          }),
          tx.payment.findUnique({
            where: { id: fixture.paymentId },
          }),
          tx.payrollEntry.findMany({
            where: { employeeId: fixture.employeeId },
            include: {
              period: true,
              adjustments: true,
              historicalPayments: true,
              manualPayments: true,
            },
          }),
          tx.cashMovement.findMany({
            where: { employeeId: fixture.employeeId },
          }),
        ]);

        requireSafe(
          employee?.name === `${fixture.marker}-Technician` &&
            employee.compensationType === "COMMISSION" &&
            employee.isBookable === false,
          "Employee ownership mismatch",
        );

        requireSafe(
          customer?.name === `${fixture.marker}-Customer`,
          "Customer ownership mismatch",
        );

        requireSafe(
          appointment?.customerId === fixture.customerId &&
            appointment.employeeId === fixture.employeeId &&
            appointment.date.toISOString().slice(0, 10) >= fixture.week,
          "Appointment ownership mismatch",
        );

        requireSafe(
          sale !== null &&
            sale.finalTotal === 300000 &&
            sale.saleAppointments.length === 1 &&
            sale.saleAppointments[0].appointmentId === fixture.appointmentId &&
            sale.lineItems.length === 1 &&
            sale.lineItems[0].id === fixture.lineItemId &&
            sale.payments.length === 1 &&
            sale.payments[0].id === fixture.paymentId &&
            sale.commissions.length === 1 &&
            sale.commissions[0].id === fixture.commissionId &&
            sale.tips.length === 0,
          "Sale ownership or dependencies mismatch",
        );

        requireSafe(
          lineItem?.saleId === fixture.saleId &&
            lineItem.employeeId === fixture.employeeId &&
            lineItem.appointmentId === fixture.appointmentId &&
            lineItem.unitPrice === 300000 &&
            lineItem.itemName === `${fixture.marker}-Test Service`,
          "Line item mismatch",
        );

        requireSafe(
          commission?.saleId === fixture.saleId &&
            commission.employeeId === fixture.employeeId &&
            commission.commissionAmount === fixture.expectedCommission &&
            commission.status === "PENDING" &&
            commission.payrollEntryId === null,
          "Commission mismatch or already assigned",
        );

        requireSafe(
          payment?.saleId === fixture.saleId &&
            payment.paymentMethod === "TRANSFER" &&
            payment.amount === 300000,
          "Payment mismatch",
        );

        requireSafe(
          entries.length <= 1 && movements.length <= 1,
          "Unexpected payroll or cashbox dependencies",
        );

        const entry = entries[0] ?? null;
        const movement = movements[0] ?? null;

        if (entry) {
          requireSafe(
            entry.period.startDate.getTime() === startDate.getTime() &&
              entry.period.status === "DRAFT" &&
              entry.period.reconciliationStatus !== "SETTLED" &&
              entry.status === "DRAFT" &&
              entry.historicalPayments.length === 0 &&
              entry.manualPayments.length === 0 &&
              entry.adjustments.length === 1,
            "Payroll entry is not safe to clean",
          );
        }

        if (movement) {
          requireSafe(
            entry !== null &&
              movement.type === "TECHNICIAN_LOAN" &&
              movement.amount === -fixture.expectedLoan &&
              movement.cashboxId === 1 &&
              movement.recordedById === fixture.ownerId &&
              movement.payrollAdjustmentId === entry.adjustments[0].id &&
              entry.adjustments[0].type === "LOAN" &&
              entry.adjustments[0].amount === fixture.expectedLoan &&
              movement.reversalOfId === null,
            "Cashbox loan ownership mismatch",
          );
        } else {
          requireSafe(
            entry === null,
            "Payroll entry exists without expected loan",
          );
        }

        const [
          employeeAppointments,
          employeeCommissions,
          employeeTips,
          customerAppointments,
          customerSales,
          linkedMovements,
        ] = await Promise.all([
          tx.appointment.count({
            where: { employeeId: fixture.employeeId },
          }),
          tx.commission.count({
            where: { employeeId: fixture.employeeId },
          }),
          tx.tip.count({
            where: { employeeId: fixture.employeeId },
          }),
          tx.appointment.count({
            where: { customerId: fixture.customerId },
          }),
          tx.saleAppointment.count({
            where: {
              appointment: {
                customerId: fixture.customerId,
              },
            },
          }),
          entry
            ? tx.cashMovement.count({
                where: {
                  payrollAdjustmentId: entry.adjustments[0].id,
                },
              })
            : Promise.resolve(0),
        ]);

        requireSafe(
          employeeAppointments === 1 &&
            employeeCommissions === 1 &&
            employeeTips === 0 &&
            customerAppointments === 1 &&
            customerSales === 1 &&
            linkedMovements === (movement ? 1 : 0),
          "Unexpected additional financial dependencies",
        );

        // Never remove a loan that has already been reversed.
        if (movement) {
          const reversalCount = await tx.cashMovement.count({
            where: {
              reversalOfId: movement.id,
            },
          });

          requireSafe(
            reversalCount === 0,
            "Loan has a reversal and cannot be deleted",
          );
        }

        // A fixture payroll entry must not own any
        // commissions or tips before cleanup.
        if (entry) {
          const [linkedCommissions, linkedTips] = await Promise.all([
            tx.commission.count({
              where: {
                payrollEntryId: entry.id,
              },
            }),
            tx.tip.count({
              where: {
                payrollEntryId: entry.id,
              },
            }),
          ]);

          requireSafe(
            linkedCommissions === 0 && linkedTips === 0,
            "Payroll entry has linked commissions or tips",
          );
        }

        console.log("PASS: Fixture ownership verified");
        console.log("Fixture:", fixture.marker);
        console.log("Payroll entry:", entry?.id ?? "None");
        console.log("Loan movement:", movement?.id ?? "None");

        if (!deleteRequested) {
          console.log("DRY RUN: No records deleted");
          return;
        }

        // Test-only cleanup in Development.
        // Delete dependent financial records first.
        if (movement) {
          await tx.cashMovement.delete({
            where: { id: movement.id },
          });
        }

        if (entry) {
          await tx.payrollAdjustment.delete({
            where: { id: entry.adjustments[0].id },
          });

          await tx.payrollEntry.delete({
            where: { id: entry.id },
          });
        }

        await tx.payment.delete({
          where: { id: fixture.paymentId },
        });

        await tx.commission.delete({
          where: { id: fixture.commissionId },
        });

        await tx.saleLineItem.delete({
          where: { id: fixture.lineItemId },
        });

        await tx.saleAppointment.delete({
          where: {
            saleId_appointmentId: {
              saleId: fixture.saleId,
              appointmentId: fixture.appointmentId,
            },
          },
        });

        await tx.sale.delete({
          where: { id: fixture.saleId },
        });

        await tx.appointment.delete({
          where: {
            id: fixture.appointmentId,
          },
        });

        await tx.customer.delete({
          where: {
            id: fixture.customerId,
          },
        });

        await tx.employee.delete({
          where: {
            id: fixture.employeeId,
          },
        });

        console.log("PASS: Cashbox test fixture deleted");

        console.log("PASS: Test payroll records removed");

        console.log("PASS: Test cash movement removed");
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 20000,
      },
    );

    if (deleteRequested) {
      console.log("PASS: Development cleanup transaction committed");
      console.log("Manifest retained for audit:", manifestPath);
    } else {
      console.log("PASS: Read-only cleanup verification completed");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("FAIL: Cashbox fixture cleanup:", error);

  process.exitCode = 1;
});
