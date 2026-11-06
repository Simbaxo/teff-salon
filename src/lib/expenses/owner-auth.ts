import { getPayrollOwner } from "@/lib/payroll/owner-auth";

// Reuse TEFF's existing OWNER authentication.
// The helper verifies the session and current database role.
export async function getExpenseOwner() {
  return getPayrollOwner();
}
