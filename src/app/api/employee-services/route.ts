import { prisma } from "@/lib/prisma";

export async function GET() {
  const employeeServices = await prisma.employeeService.findMany({
    orderBy: [
      {
        employeeId: "asc",
      },
      {
        serviceId: "asc",
      },
    ],
  });

  return Response.json(employeeServices);
}