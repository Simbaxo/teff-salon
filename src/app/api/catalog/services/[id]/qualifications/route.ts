import { auth } from "@/auth";
import { canManageStaff } from "@/lib/auth-roles";

export async function PUT() {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageStaff(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return Response.json(
    {
      error:
        "La actualización masiva de servicios está deshabilitada. " +
        "Utiliza Gestión de Personal para modificar las asignaciones " +
        "individualmente.",
    },
    { status: 409 },
  );
}
