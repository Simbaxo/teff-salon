import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function getExpenseStaff() {
  const session = await auth();

  if (!session?.user) {
    return {
      success: false as const,
      status: 401,
      error: "Unauthorized",
    };
  }

  const userId = Number(session.user.id);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return {
      success: false as const,
      status: 401,
      error: "Sesión inválida.",
    };
  }

  if (session.user.role !== "OWNER" && session.user.role !== "RECEPTIONIST") {
    return {
      success: false as const,
      status: 403,
      error: "Forbidden",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      active: true,
    },
  });

  if (
    !user ||
    !user.active ||
    (user.role !== "OWNER" && user.role !== "RECEPTIONIST") ||
    user.role !== session.user.role
  ) {
    return {
      success: false as const,
      status: 403,
      error: "Forbidden",
    };
  }

  return {
    success: true as const,
    userId: user.id,
    role: user.role as "OWNER" | "RECEPTIONIST",
  };
}
