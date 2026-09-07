import { redirect } from "next/navigation";
import { auth } from "@/auth";
import StaffPageClient from "./StaffPageClient";

export default async function StaffPage() {
  const session = await auth();

  // Require a logged-in TEFF user before loading staff tools
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <StaffPageClient 
      userName={session.user.name ?? "Usuario"}
      userRole={session.user.role}
    />
  );
}