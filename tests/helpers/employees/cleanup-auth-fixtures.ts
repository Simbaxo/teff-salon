import "dotenv/config";
import { readFile, unlink } from "node:fs/promises";
import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";

type Fixture = {
  marker: string;
  ownerId: number;
  receptionistId: number;
  ownerEmail: string;
  receptionistEmail: string;
};

async function main() {
  const connectionString = getSafeTestDatabaseUrl();
  const manifestPath = process.argv[2];

  if (
    !manifestPath ||
    !/^\.teff-test-fixtures\/employee-auth-teff-employee-auth-[0-9a-f-]{36}\.json$/.test(
      manifestPath,
    )
  ) {
    throw new Error("STOP: Invalid employee test manifest path.");
  }

  const fixture = JSON.parse(await readFile(manifestPath, "utf8")) as Fixture;

  if (
    !/^teff-employee-auth-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      fixture.marker,
    ) ||
    manifestPath !==
      `.teff-test-fixtures/employee-auth-${fixture.marker}.json` ||
    !Number.isSafeInteger(fixture.ownerId) ||
    !Number.isSafeInteger(fixture.receptionistId) ||
    fixture.ownerId <= 0 ||
    fixture.receptionistId <= 0 ||
    fixture.ownerId === fixture.receptionistId ||
    fixture.ownerEmail !== `${fixture.marker}-owner@example.invalid` ||
    fixture.receptionistEmail !==
      `${fixture.marker}-receptionist@example.invalid`
  ) {
    throw new Error("STOP: Invalid fixture ownership information.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where: {
          id: {
            in: [fixture.ownerId, fixture.receptionistId],
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          employeeId: true,
        },
      });

      if (users.length !== 2) {
        throw new Error("STOP: Test accounts missing.");
      }

      const owner = users.find((user) => user.id === fixture.ownerId);

      const receptionist = users.find(
        (user) => user.id === fixture.receptionistId,
      );

      if (
        !owner ||
        owner.name !== `${fixture.marker}-owner` ||
        owner.email !== fixture.ownerEmail ||
        owner.role !== "OWNER" ||
        owner.employeeId !== null ||
        !receptionist ||
        receptionist.name !== `${fixture.marker}-receptionist` ||
        receptionist.email !== fixture.receptionistEmail ||
        receptionist.role !== "RECEPTIONIST" ||
        receptionist.employeeId !== null
      ) {
        throw new Error("STOP: Test account ownership mismatch.");
      }

      // Never delete a test user who has acquired operational records.
      // This also protects relations configured with ON DELETE CASCADE.
      const userIds = [fixture.ownerId, fixture.receptionistId];

      const related = await Promise.all([
        tx.pushSubscription.count({
          where: { userId: { in: userIds } },
        }),
        tx.bookingReadReceipt.count({
          where: { userId: { in: userIds } },
        }),
        tx.inventoryMovement.count({
          where: { userId: { in: userIds } },
        }),
        tx.payrollManualPayment.count({
          where: { recordedByUserId: { in: userIds } },
        }),
        tx.weeklySalesReview.count({
          where: { reviewedById: { in: userIds } },
        }),
        tx.cashbox.count({
          where: { openedById: { in: userIds } },
        }),
        tx.cashMovement.count({
          where: { recordedById: { in: userIds } },
        }),
        tx.cashCount.count({
          where: { countedById: { in: userIds } },
        }),
        tx.expense.count({
          where: {
            OR: [
              { createdById: { in: userIds } },
              { reviewedById: { in: userIds } },
            ],
          },
        }),
        tx.expenseReceipt.count({
          where: { uploadedById: { in: userIds } },
        }),
      ]);

      if (related.some((count) => count !== 0)) {
        throw new Error(
          "STOP: Test accounts have operational records. Cleanup refused.",
        );
      }

      // Auth.js may have recorded failed login attempts.
      // These records contain only the fixture's exact email addresses.
      await tx.loginAttempt.deleteMany({
        where: {
          email: {
            in: [fixture.ownerEmail, fixture.receptionistEmail],
          },
        },
      });

      await tx.user.deleteMany({
        where: {
          id: {
            in: [fixture.ownerId, fixture.receptionistId],
          },
        },
      });
    });

    await unlink(manifestPath);

    console.log("PASS: Test accounts and manifest removed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
