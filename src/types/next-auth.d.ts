import "next-auth";
import "next-auth/jwt";

type TeffUserRole = "OWNER" | "RECEPTIONIST" | "TECHNICIAN";

declare module "next-auth" {
    interface User {
        role: TeffUserRole;
        employeeId: number | null;
    }

    interface Session {
        user: {
            id: string;
            name?: string | null;
            email?: string | null;
            role: TeffUserRole;
            employeeId: number | null;
        };
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        role: TeffUserRole;
        employeeId: number | null;
    }
}