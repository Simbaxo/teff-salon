import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { getSafeTestDatabaseUrl } from "../helpers/test-database";
import {
  hasUnfinishedServiceAppointments,
  hasOtherQualifiedEmployee,
} from "../../src/lib/employees/qualification-removal";

test("unfinished appointments prevent qualification removal", async () => {
  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const marker = `teff-removal-${randomUUID()}`;

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

          const customer = await tx.customer.create({
            data: { name: marker },
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
              employeeId: employee.id,
              serviceId: service.id,
            },
          });

          const appointment = await tx.appointment.create({
            data: {
              customerId: customer.id,
              employeeId: employee.id,
              date: new Date("2099-01-05T00:00:00.000Z"),
              startTime: "10:00",
              duration: 60,
              status: "BOOKED",
            },
          });

          await tx.appointmentService.create({
            data: {
              appointmentId: appointment.id,
              serviceId: service.id,
              bookedPrice: 150000,
              bookedDuration: 60,
            },
          });

          const blocked = await hasUnfinishedServiceAppointments(
            tx,
            employee.id,
            service.id,
          );

          assert.equal(blocked, true);
          console.log("PASS: BOOKED appointment detected.");

          await tx.appointment.update({
            where: { id: appointment.id },
            data: { status: "IN_PROGRESS" },
          });

          assert.equal(
            await hasUnfinishedServiceAppointments(tx, employee.id, service.id),
            true,
          );

          console.log("PASS: IN_PROGRESS appointment detected.");

          await tx.appointment.update({
            where: { id: appointment.id },
            data: { status: "COMPLETED" },
          });

          assert.equal(
            await hasUnfinishedServiceAppointments(tx, employee.id, service.id),
            false,
          );

          console.log("PASS: COMPLETED appointment excluded.");

          const qualification = await tx.employeeService.findUniqueOrThrow({
            where: {
              employeeId_serviceId: {
                employeeId: employee.id,
                serviceId: service.id,
              },
            },
          });

          assert.equal(qualification.employeeId, employee.id);

          console.log("PASS: Qualification preserved.");

          throw new Error("TEST_ROLLBACK");
        },
        {
          isolationLevel: "ReadCommitted",
          maxWait: 10000,
          timeout: 20000,
        },
      ),
      /TEST_ROLLBACK/,
    );

    assert.equal(
      await prisma.employee.count({
        where: { name: marker },
      }),
      0,
    );

    assert.equal(
      await prisma.customer.count({
        where: { name: marker },
      }),
      0,
    );

    assert.equal(
      await prisma.service.count({
        where: { nameEs: marker },
      }),
      0,
    );

    console.log("PASS: All temporary records rolled back.");
  } finally {
    await prisma.$disconnect();
  }
});
test("last qualified employee protection includes non-bookable staff", async () => {
  const connectionString = getSafeTestDatabaseUrl();

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const marker = `teff-qualified-${randomUUID()}`;

  try {
    await assert.rejects(
      prisma.$transaction(
        async (tx) => {
          const first = await tx.employee.create({
            data: {
              name: `${marker}-first`,
              active: true,
              isBookable: true,
              compensationType: "COMMISSION",
            },
          });

          const second = await tx.employee.create({
            data: {
              name: `${marker}-second`,
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
              employeeId: first.id,
              serviceId: service.id,
            },
          });

          assert.equal(
            await hasOtherQualifiedEmployee(tx, first.id, service.id),
            false,
          );

          console.log("PASS: Last qualified employee protected.");

          await tx.employeeService.create({
            data: {
              employeeId: second.id,
              serviceId: service.id,
            },
          });

          assert.equal(
            await hasOtherQualifiedEmployee(tx, first.id, service.id),
            true,
          );

          console.log("PASS: Non-bookable employee counts as qualified.");

          await tx.employee.update({
            where: { id: second.id },
            data: { active: false },
          });

          assert.equal(
            await hasOtherQualifiedEmployee(tx, first.id, service.id),
            false,
          );

          console.log("PASS: Inactive employee excluded.");

          await tx.employee.update({
            where: { id: second.id },
            data: {
              active: true,
              compensationType: "FIXED_WEEKLY",
            },
          });

          assert.equal(
            await hasOtherQualifiedEmployee(tx, first.id, service.id),
            false,
          );

          console.log("PASS: Fixed-weekly employee excluded.");

          throw new Error("TEST_ROLLBACK");
        },
        {
          isolationLevel: "ReadCommitted",
          maxWait: 10000,
          timeout: 20000,
        },
      ),
      /TEST_ROLLBACK/,
    );

    const remainingEmployees = await prisma.employee.count({
      where: { name: { startsWith: marker } },
    });

    const remainingServices = await prisma.service.count({
      where: { nameEs: marker },
    });

    assert.equal(remainingEmployees, 0);
    assert.equal(remainingServices, 0);

    console.log("PASS: Temporary records rolled back.");
  } finally {
    await prisma.$disconnect();
  }
});
