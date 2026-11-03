import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient, Prisma } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";
import {
  getTeffToday,
  getTeffDayOfWeek,
  addTeffDays,
} from "../../../src/lib/datetime";

async function main() {
  // Refuse any database other than Neon Development.
  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const marker = `teff-cashbox-${randomUUID()}`;

  const directory = ".teff-test-fixtures";
  const manifestPath = `${directory}/cashbox-${marker}.json`;

  const today = getTeffToday();
  const weekday = getTeffDayOfWeek(today);

  const week = addTeffDays(today, -(weekday === 0 ? 6 : weekday - 1));

  const serviceDate = new Date(`${today}T00:00:00.000Z`);

  await mkdir(directory, { recursive: true });

  // Reserve the manifest before creating any records.
  await writeFile(manifestPath, "PENDING", {
    mode: 0o600,
    flag: "wx",
  });

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Use the existing Development OWNER.
        const owner = await tx.user.findUnique({
          where: { id: 1 },
          select: {
            id: true,
            active: true,
            role: true,
          },
        });

        if (!owner?.active || owner.role !== "OWNER") {
          throw new Error("Development OWNER unavailable");
        }

        // Verify the Development test cashbox.
        const cashbox = await tx.cashbox.findUnique({
          where: { id: 1 },
        });

        if (!cashbox || cashbox.openingBalance !== 500000) {
          throw new Error("Unexpected Development cashbox");
        }

        // Never create fixtures against locked payroll.
        const period = await tx.payrollPeriod.findUnique({
          where: {
            startDate: new Date(`${week}T00:00:00.000Z`),
          },
        });

        if (
          period &&
          (period.status !== "DRAFT" ||
            period.reconciliationStatus === "SETTLED")
        ) {
          throw new Error("Test payroll week is locked");
        }

        const employee = await tx.employee.create({
          data: {
            name: `${marker}-Technician`,
            active: true,
            isBookable: false,
            compensationType: "COMMISSION",
          },
        });

        const customer = await tx.customer.create({
          data: {
            name: `${marker}-Customer`,
          },
        });

        const appointment = await tx.appointment.create({
          data: {
            customerId: customer.id,
            employeeId: employee.id,
            date: serviceDate,
            startTime: "10:00",
            duration: 60,
            status: "COMPLETED",
          },
        });

        const sale = await tx.sale.create({
          data: {
            subtotal: 300000,
            discountTotal: 0,
            finalTotal: 300000,
          },
        });

        await tx.saleAppointment.create({
          data: {
            saleId: sale.id,
            appointmentId: appointment.id,
          },
        });

        const lineItem = await tx.saleLineItem.create({
          data: {
            saleId: sale.id,
            itemType: "SERVICE",
            itemName: `${marker}-Test Service`,
            unitPrice: 300000,
            employeeId: employee.id,
            appointmentId: appointment.id,
          },
        });

        const commission = await tx.commission.create({
          data: {
            saleId: sale.id,
            employeeId: employee.id,
            commissionBase: 300000,
            commissionRate: 50,
            commissionAmount: 150000,
            status: "PENDING",
          },
        });

        // Non-cash payment: no cashbox increase.
        const payment = await tx.payment.create({
          data: {
            saleId: sale.id,
            paymentMethod: "TRANSFER",
            amount: 300000,
            processingFee: 0,
          },
        });

        const manifest = {
          marker,
          week,
          ownerId: owner.id,
          employeeId: employee.id,
          customerId: customer.id,
          appointmentId: appointment.id,
          saleId: sale.id,
          lineItemId: lineItem.id,
          commissionId: commission.id,
          paymentId: payment.id,
          expectedCommission: 150000,
          expectedLoan: 50000,
        };

        // Record exact ownership IDs before commit.
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), {
          mode: 0o600,
        });

        return manifest;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    console.log("PASS: Cashbox test fixture created");

    console.log("Week:", result.week);
    console.log("Employee ID:", result.employeeId);
    console.log("Sale ID:", result.saleId);
    console.log("Commission:", result.expectedCommission);
    console.log("Manifest:", manifestPath);
  } catch (error) {
    // A failed or uncertain commit must be investigated
    // using the reserved fixture manifest.
    // Never automatically delete financial test records.
    console.error(
      "Fixture creation failed. Inspect the manifest and " +
        "Development database before retrying:",
      manifestPath,
    );

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("FAIL: Cashbox fixture creation:", error);

  process.exitCode = 1;
});
