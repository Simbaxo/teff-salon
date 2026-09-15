import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Safety first: inspect the amount of operational data before
  // allowing any destructive cleanup to happen.
  const [
    customers,
    appointments,
    sales,
    payments,
    commissions,
    tips,
    employees,
    services,
    addons,
    employeeServices,
    serviceAddons,
    users,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.appointment.count(),
    prisma.sale.count(),
    prisma.payment.count(),
    prisma.commission.count(),
    prisma.tip.count(),
    prisma.employee.count(),
    prisma.service.count(),
    prisma.addon.count(),
    prisma.employeeService.count(),
    prisma.serviceAddon.count(),
    prisma.user.count(),
  ]);

  console.log("TEFF pre-production cleanup preview");
  console.log("--------------------------------");
  console.log(`Customers:    ${customers}`);
  console.log(`Appointments: ${appointments}`);
  console.log(`Sales:        ${sales}`);
  console.log(`Payments:     ${payments}`);
  console.log(`Commissions:  ${commissions}`);
  console.log(`Tips:         ${tips}`);

  console.log("\nPreserved configuration");
  console.log("--------------------------------");
  console.log(`Employees:        ${employees}`);
  console.log(`Services:         ${services}`);
  console.log(`Add-ons:          ${addons}`);
  console.log(`EmployeeServices: ${employeeServices}`);
  console.log(`ServiceAddons:    ${serviceAddons}`);
  console.log(`Users:            ${users}`);

  const cleanupConfirmed =
  process.env.CLEANUP_CONFIRM === "DELETE_TEFF_TEST_DATA";

  if (!cleanupConfirmed) {
    console.log("\nDRY RUN ONLY — nothing was deleted.");
    console.log(
      "To allow cleanup, set CLEANUP_CONFIRM=DELETE_TEFF_TEST_DATA."
    );
    return;
  }

  console.log("\n⚠️ Confirmation accepted. Cleaning test operational data...");

  await prisma.$transaction(async (tx) => {
    // Delete sale-dependent records before their parent Sale rows.
    await tx.payment.deleteMany();
    await tx.commission.deleteMany();
    await tx.tip.deleteMany();
    await tx.saleLineItem.deleteMany();
    await tx.saleAppointment.deleteMany();

    // Sales can now be removed safely because their dependent records are gone.
    await tx.sale.deleteMany();

    // Delete appointment snapshots before removing appointments.
    await tx.appointmentService.deleteMany();
    await tx.appointmentAddon.deleteMany();

    // Customers can only be removed after their appointments are gone.
    await tx.appointment.deleteMany();
    await tx.customer.deleteMany();
  });

  console.log("✅ Test operational data cleanup completed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });