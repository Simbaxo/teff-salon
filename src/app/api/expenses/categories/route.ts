import { prisma } from "@/lib/prisma";
import { getExpenseStaff } from "@/lib/expenses/staff-auth";

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
};

export async function GET() {
  const staff = await getExpenseStaff();

  if (!staff.success) {
    return Response.json(
      { error: staff.error },
      {
        status: staff.status,
        headers: noStoreHeaders,
      },
    );
  }

  try {
    const categories = await prisma.expenseCategory.findMany({
      where: {
        active: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return Response.json({ categories }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Failed to load expense categories:", error);

    return Response.json(
      { error: "No se pudieron consultar las categorías." },
      {
        status: 500,
        headers: noStoreHeaders,
      },
    );
  }
}
