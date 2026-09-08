import "dotenv/config";

import { prisma } from "../src/lib/prisma";

async function main() {
  // Find every customer so we can group exact duplicate phone numbers
  const customers = await prisma.customer.findMany({
    orderBy: {
      id: "asc",
    },
  });

  const customersByPhone = new Map<
    string,
    typeof customers
  >();

  for (const customer of customers) {
    const existing = customersByPhone.get(customer.phone) ?? [];
    existing.push(customer);
    customersByPhone.set(customer.phone, existing);
  }

  let mergedCustomers = 0;

  for (const [phone, duplicates] of customersByPhone) {
    // Nothing to merge when only one customer uses the phone number
    if (duplicates.length <= 1) {
      continue;
    }

    // Keep the oldest customer record
    const keeper = duplicates[0];
    const duplicateIds = duplicates.slice(1).map((customer) => customer.id);

    console.log(
      `Merging ${duplicates.length} customers with phone ${phone} into customer ${keeper.id}`
    );

    await prisma.$transaction(async (tx) => {
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

      // Delete only after their appointments have been reassigned
      await tx.customer.deleteMany({
        where: {
          id: {
            in: duplicateIds,
          },
        },
      });
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