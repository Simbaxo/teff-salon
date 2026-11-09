import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../test-database";

async function main() {
  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const marker = `teff-employee-auth-${randomUUID()}`;
  const password = randomUUID() + randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);

  const ownerEmail = `${marker}-owner@example.invalid`;
  const receptionistEmail = `${marker}-receptionist@example.invalid`;

  const manifestPath = `.teff-test-fixtures/employee-auth-${marker}.json`;

  try {
    const users = await prisma.$transaction(
      async (tx) => {
        const owner = await tx.user.create({
          data: {
            name: `${marker}-owner`,
            email: ownerEmail,
            passwordHash,
            role: "OWNER",
            active: true,
          },
        });

        const receptionist = await tx.user.create({
          data: {
            name: `${marker}-receptionist`,
            email: receptionistEmail,
            passwordHash,
            role: "RECEPTIONIST",
            active: true,
          },
        });

        return { owner, receptionist };
      },
      {
        maxWait: 15000,
        timeout: 20000,
      },
    );

    await mkdir(".teff-test-fixtures", { recursive: true });

    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          marker,
          ownerId: users.owner.id,
          receptionistId: users.receptionist.id,
          ownerEmail,
          receptionistEmail,
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );

    console.log("PASS: Development test accounts created.");
    console.log("Manifest:", manifestPath);
    console.log("OWNER email:", ownerEmail);
    console.log("RECEPTIONIST email:", receptionistEmail);
    console.log("Temporary password:", password);
    console.log("Keep these credentials private.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
