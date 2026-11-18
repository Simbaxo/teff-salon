import assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calculateCashboxBalance } from "../../src/lib/cashbox/balance";
import { lockCashbox } from "../../src/lib/cashbox/lock";

test("cash deposit increases balance and rolls back safely", async () => {
  const connectionString = process.env.DATABASE_URL;

  assert.ok(connectionString, "DATABASE_URL is missing");

  const endpoint = new URL(connectionString).hostname.replace(
    /-pooler(?=\.)/,
    "",
  );

  assert.equal(
    endpoint,
    "ep-ancient-cherry-ax0y0y4q.c-4.us-east-2.aws.neon.tech",
    "STOP: Only the Neon test database is authorized.",
  );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const idempotencyKey = crypto.randomUUID();
  const depositAmount = 200000;
  const rollbackMarker = "TEST_CASHBOX_ROLLBACK";

  try {
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await lockCashbox(tx);

        const cashbox = await tx.cashbox.findUniqueOrThrow({
          where: { id: 1 },
        });

        const owner = await tx.user.findFirst({
          where: {
            role: "OWNER",
            active: true,
          },
          select: { id: true },
        });

        assert.ok(owner, "No active test OWNER found");

        const before = await calculateCashboxBalance(tx, cashbox);

        const deposit = await tx.cashMovement.create({
          data: {
            cashboxId: cashbox.id,
            type: "CASH_ADJUSTMENT_IN",
            amount: depositAmount,
            description: "Test deposit - rollback",
            recordedById: owner.id,
            idempotencyKey,
          },
        });

        assert.equal(deposit.amount, 200000);

        const after = await calculateCashboxBalance(tx, cashbox);

        assert.equal(
          after.balance,
          before.balance + depositAmount,
        );

        assert.equal(
          after.otherCashIn,
          before.otherCashIn + depositAmount,
        );

        assert.equal(after.cashSales, before.cashSales);

        console.log("PASS: Deposit recorded as positive cash");
        console.log("PASS: Balance increased by $200,000 COP");
        console.log("PASS: Cash sales remained unchanged");

        throw new Error(rollbackMarker);
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === rollbackMarker,
    );

    const remaining = await prisma.cashMovement.findUnique({
      where: { idempotencyKey },
    });

    assert.equal(remaining, null);

    console.log("PASS: Test transaction rolled back");
    console.log("PASS: No permanent deposit record");
  } finally {
    await prisma.$disconnect();
  }
});
