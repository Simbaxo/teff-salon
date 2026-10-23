import { prisma } from "@/lib/prisma";

export async function GET() {
  const employees = await prisma.employee.findMany({
    where: {
      active: true,
      isBookable: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  return Response.json(employees);
}