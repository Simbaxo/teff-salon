import { redirect } from "next/navigation";
import { auth } from "@/auth";
import StaffPageClient from "./StaffPageClient";
import { canAccessStaff } from "@/lib/auth-roles";

export default async function StaffPage() {
  const session = await auth();

  // Require a logged-in TEFF user before loading staff tools
  if (!session?.user) {
    redirect("/login");
  }

  // Technicians do not have access to the staff app yet
  if (!canAccessStaff(session.user.role)) {
    redirect("/login");
  }

  return (
    <StaffPageClient 
      userName={session.user.name ?? "Usuario"}
      userRole={session.user.role}
    />
  );
}