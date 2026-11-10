import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";

test("adding a qualification preserves inactive employee assignments", async () => {
  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const marker = `teff-qualification-${randomUUID()}`;

  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const inactiveEmployee = await tx.employee.create({
            data: {
              name: `${marker}-inactive`,
              active: false,
              isBookable: false,
              compensationType: "COMMISSION",
            },
          });

          const newEmployee = await tx.employee.create({
            data: {
              name: `${marker}-active`,
              active: true,
              isBookable: false,
              compensationType: "COMMISSION",
            },
          });

          const service = await tx.service.create({
            data: {
              nameEs: marker,
              nameEn: marker,
              category: "ESTHETICS",
              price: 150000,
              estimatedDuration: 60,
              requiresApproval: true,
              active: true,
            },
          });

          await tx.employeeService.create({
            data: {
              employeeId: inactiveEmployee.id,
              serviceId: service.id,
            },
          });

          const qualification = await tx.employeeService.upsert({
            where: {
              employeeId_serviceId: {
                employeeId: newEmployee.id,
                serviceId: service.id,
              },
            },
            update: {},
            create: {
              employeeId: newEmployee.id,
              serviceId: service.id,
            },
          });

          assert.equal(qualification.employeeId, newEmployee.id);

          // Repeating the operation must not create a duplicate.
          await tx.employeeService.upsert({
            where: {
              employeeId_serviceId: {
                employeeId: newEmployee.id,
                serviceId: service.id,
              },
            },
            update: {},
            create: {
              employeeId: newEmployee.id,
              serviceId: service.id,
            },
          });

          const assignments = await tx.employeeService.findMany({
            where: { serviceId: service.id },
            orderBy: { employeeId: "asc" },
          });

          assert.deepEqual(
            assignments.map((item) => item.employeeId),
            [inactiveEmployee.id, newEmployee.id].sort((a, b) => a - b),
          );

          const unchanged = await tx.employee.findUniqueOrThrow({
            where: { id: newEmployee.id },
          });

          assert.equal(unchanged.isBookable, false);

          console.log("PASS: New qualification added.");
          console.log("PASS: Inactive employee assignment preserved.");
          console.log("PASS: Duplicate qualification prevented.");
          console.log("PASS: Booking availability unchanged.");

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

    const remaining = await prisma.employee.count({
      where: { name: { startsWith: marker } },
    });

    const remainingService = await prisma.service.count({
      where: { nameEs: marker },
    });

    assert.equal(remaining, 0);
    assert.equal(remainingService, 0);

    console.log("PASS: Temporary records rolled back.");
  } finally {
    await prisma.$disconnect();
  }
});
