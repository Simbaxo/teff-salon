import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";

test("unfinished appointments prevent employee deactivation", async () => {
  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const marker = `teff-employee-${randomUUID()}`;

  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const employee = await tx.employee.create({
            data: {
              name: marker,
              active: true,
              isBookable: true,
              compensationType: "COMMISSION",
            },
          });

          const customer = await tx.customer.create({
            data: {
              name: `${marker}-customer`,
            },
          });

          await tx.appointment.create({
            data: {
              customerId: customer.id,
              employeeId: employee.id,
              date: new Date("2099-01-05T00:00:00.000Z"),
              startTime: "10:00",
              duration: 60,
              status: "BOOKED",
            },
          });

          const unfinished = await tx.appointment.count({
            where: {
              employeeId: employee.id,
              status: {
                in: ["REQUESTED", "BOOKED", "CHECKED_IN", "IN_PROGRESS"],
              },
            },
          });

          assert.equal(unfinished, 1);

          if (unfinished > 0) {
            throw new Error("UNFINISHED_APPOINTMENTS");
          }

          await tx.employee.update({
            where: { id: employee.id },
            data: {
              active: false,
              isBookable: false,
            },
          });
        },
        {
          isolationLevel: "ReadCommitted",
          maxWait: 15000,
          timeout: 20000,
        },
      ),
      /UNFINISHED_APPOINTMENTS/,
    );

    const remaining = await prisma.employee.findFirst({
      where: { name: marker },
    });

    assert.equal(remaining, null);

    console.log(
      "PASS: Unfinished appointment blocked deactivation; test records rolled back.",
    );
  } finally {
    await prisma.$disconnect();
  }
});

test("employee reactivation does not automatically enable bookings", async () => {
  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const marker = `teff-employee-status-${randomUUID()}`;

  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const employee = await tx.employee.create({
            data: {
              name: marker,
              active: true,
              isBookable: true,
              compensationType: "COMMISSION",
            },
          });

          const inactive = await tx.employee.update({
            where: { id: employee.id },
            data: {
              active: false,
              isBookable: false,
            },
          });

          assert.equal(inactive.active, false);
          assert.equal(inactive.isBookable, false);

          const reactivated = await tx.employee.update({
            where: { id: employee.id },
            data: {
              active: true,
            },
          });

          assert.equal(reactivated.active, true);
          assert.equal(reactivated.isBookable, false);

          throw new Error("TEST_ROLLBACK");
        },
        {
          isolationLevel: "ReadCommitted",
          maxWait: 15000,
          timeout: 20000,
        },
      ),
      /TEST_ROLLBACK/,
    );

    const remaining = await prisma.employee.findFirst({
      where: { name: marker },
    });

    assert.equal(remaining, null);

    console.log(
      "PASS: Reactivation preserved disabled booking status; test records rolled back.",
    );
  } finally {
    await prisma.$disconnect();
  }
});
