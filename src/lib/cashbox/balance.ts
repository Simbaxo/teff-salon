import type { Prisma } from "@/generated/prisma/client";

type CashboxReference = {
  id: number;
  openingBalance: number;
  openedAt: Date;
};

// Calculate the continuous physical cash balance.
// The caller owns the database transaction.
export async function calculateCashboxBalance(
  tx: Prisma.TransactionClient,
  cashbox: CashboxReference,
) {
  // Cash received from sales after activation.
  const cashPayments = await tx.payment.aggregate({
    where: {
      paymentMethod: "CASH",
      createdAt: {
        gte: cashbox.openedAt,
      },
    },
    _sum: {
      amount: true,
    },
    _count: {
      id: true,
    },
  });

  // Manual money entering the cashbox.
  const incoming = await tx.cashMovement.aggregate({
    where: {
      cashboxId: cashbox.id,
      amount: { gt: 0 },
    },
    _sum: {
      amount: true,
    },
  });

  // Manual money leaving the cashbox.
  const outgoing = await tx.cashMovement.aggregate({
    where: {
      cashboxId: cashbox.id,
      amount: { lt: 0 },
    },
    _sum: {
      amount: true,
    },
  });

  const cashSales = cashPayments._sum.amount ?? 0;
  const otherCashIn = incoming._sum.amount ?? 0;
  const cashOut = Math.abs(outgoing._sum.amount ?? 0);

  const balance = cashbox.openingBalance + cashSales + otherCashIn - cashOut;

  if (
    !Number.isSafeInteger(balance) ||
    !Number.isSafeInteger(cashSales) ||
    !Number.isSafeInteger(otherCashIn) ||
    !Number.isSafeInteger(cashOut)
  ) {
    throw new Error("INVALID_CASHBOX_BALANCE");
  }

  return {
    cashboxId: cashbox.id,
    openedAt: cashbox.openedAt,
    openingBalance: cashbox.openingBalance,
    cashSales,
    cashSalesCount: cashPayments._count.id,
    otherCashIn,
    cashOut,
    balance,
  };
}
