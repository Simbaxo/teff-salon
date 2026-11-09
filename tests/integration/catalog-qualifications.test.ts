import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";

test("non-bookable employee can be qualified without enabling bookings", async () => {
  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const marker = `teff-catalog-${randomUUID()}`;

  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const employee = await tx.employee.create({
            data: {
              name: marker,
              active: true,
              isBookable: false,
              compensationType: "COMMISSION",
            },
          });

          const eligible = await tx.employee.findMany({
            where: {
              id: employee.id,
              active: true,
              compensationType: "COMMISSION",
            },
            select: {
              id: true,
            },
          });

          assert.equal(eligible.length, 1);

          const publiclyBookable = await tx.employee.count({
            where: {
              id: employee.id,
              active: true,
              isBookable: true,
            },
          });

          assert.equal(publiclyBookable, 0);

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
              employeeId: employee.id,
              serviceId: service.id,
            },
          });

          const qualification = await tx.employeeService.findUnique({
            where: {
              employeeId_serviceId: {
                employeeId: employee.id,
                serviceId: service.id,
              },
            },
          });

          assert.ok(qualification);

          const unchangedEmployee = await tx.employee.findUniqueOrThrow({
            where: { id: employee.id },
          });

          assert.equal(unchangedEmployee.active, true);
          assert.equal(unchangedEmployee.isBookable, false);

          console.log("PASS: Non-bookable commission employee qualified.");

          console.log("PASS: Public booking availability remains disabled.");

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

    const remainingEmployee = await prisma.employee.findFirst({
      where: { name: marker },
    });

    const remainingService = await prisma.service.findFirst({
      where: { nameEs: marker },
    });

    assert.equal(remainingEmployee, null);
    assert.equal(remainingService, null);

    console.log("PASS: Test employee and service were rolled back.");
  } finally {
    await prisma.$disconnect();
  }
});
