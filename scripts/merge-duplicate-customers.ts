import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { normalizePhoneNumber } from "../src/lib/phone";

async function main() {
  const dryRun = process.env.DRY_RUN === "true";

  // Find every customer so we can group exact duplicate phone numbers
  const customers = await prisma.customer.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      _count: {
        select: {
          appointments: true,
        },
      },
      appointments: {
        select: {
          id: true,
          date: true,
          startTime: true,
          status: true,
          saleAppointments: {
            select: {
              saleId: true,
            }
          }
        }
      }
    },
  });

  const customersByPhone = new Map<
    string,
    typeof customers
  >();

  for (const customer of customers) {
    if (!customer.phone) {
      continue;
    }

  const normalizedPhone = normalizePhoneNumber(customer.phone);

    // Skip values that cannot be safely normalized
    if (!normalizedPhone) {
      console.warn(
        `\nCustomer ${customer.id} (${customer.name}) | ${customer.phone}`
      );

      for (const appointment of customer.appointments) {
        console.warn(
          `  Appointment ${appointment.id} | ${appointment.date.toISOString().slice(0, 10)} | ${appointment.startTime} | ${appointment.status} | Sales: ${
            appointment.saleAppointments.length > 0
              ? appointment.saleAppointments.map((sale) => sale.saleId).join(", ")
              : "none"
          }`
        );
      }

      continue;
    }

    const existing = customersByPhone.get(normalizedPhone) ?? [];
    existing.push(customer);
    customersByPhone.set(normalizedPhone, existing);
  }

  let mergedCustomers = 0;

  for (const [normalizedPhone, duplicates] of customersByPhone) {
    // Keep the oldest customer record
    const keeper = duplicates[0];
    const duplicateIds = duplicates.slice(1).map((customer) => customer.id);

    if (duplicateIds.length > 0) {
      console.log(
        `Merging ${duplicates.length} customers with phone ${normalizedPhone} into customer ${keeper.id}`
      );
    }

    if (dryRun) {
      if (duplicateIds.length > 0) {
        console.log(
          `[DRY RUN] Would merge customer ID ${duplicateIds.join(", ")} into customer ${keeper.id}`
        );
      }

      if (keeper.phone !== normalizedPhone) {
        console.log(
          `[DRY RUN] Would normalize customer ${keeper.id}: ${keeper.phone} -> ${normalizedPhone}`
        );
      }

      mergedCustomers += duplicateIds.length;
      continue;
    }


    await prisma.$transaction(async (tx) => {
      if (duplicateIds.length > 0) {
        // Move every appointment to the customer record we are keeping
        await tx.appointment.updateMany({
          where: {
            customerId: {
              in: duplicateIds,
            },
          },
          data: {
            customerId: keeper.id,
          },
        });
      }

      // Delete duplicates before assigning the normalized phone
      // This avoids collisions with the unique phone constraint
      await tx.customer.deleteMany({
        where: {
          id: {
            in: duplicateIds,
          },
        },
      });
      

    // Normalize the keeper even when there were no duplicates
    if (keeper.phone !== normalizedPhone) {
      await tx.customer.update({
        where: {
          id: keeper.id,
        },
        data: {
          phone: normalizedPhone,
        },
      });
    }
    });
    mergedCustomers += duplicateIds.length;
  }

  console.log(`Done. Removed ${mergedCustomers} duplicate customer records.`);
}

main()
  .catch((error) => {
    console.error("Customer merge failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });