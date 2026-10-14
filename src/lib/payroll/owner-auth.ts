
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Resolve the authenticated Owner from the database.
// Never trust a user ID supplied in the request body.
export async function getPayrollOwner() {
    const session = await auth();

    if (!session?.user) {
        return {
            success: false as const,
            status: 401,
            error: "Unauthorized",
        };
    }

    if (session.user.role !== "OWNER") {
        return {
            success: false as const,
            status: 403,
            error: "Forbidden",
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

    // Verify the account still exists, is active, and is OWNER.
    const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            active: true,
            role: true,
        },
    });

    if (!owner || !owner.active || owner.role !== "OWNER") {
        return {
            success: false as const,
            status: 403,
            error: "Forbidden",
        };
    }

    return {
        success: true as const,
        ownerId: owner.id,
    };
}