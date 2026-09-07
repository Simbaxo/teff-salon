import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.NEW_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.NEW_USER_PASSWORD;
  const name = process.env.NEW_USER_NAME;
  const role = process.env.NEW_USER_ROLE;

  // Require all account fields before creating a login
  if (!email || !password || !name || !role) {
    throw new Error(
      "NEW_USER_EMAIL, NEW_USER_PASSWORD, NEW_USER_NAME and NEW_USER_ROLE are required"
    );
  }

  if (!["OWNER", "RECEPTIONIST", "TECHNICIAN"].includes(role)) {
    throw new Error("Invalid user role");
  }

  // Never store the plaintext password
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: role as "OWNER" | "RECEPTIONIST" | "TECHNICIAN",
    },
  });

  console.log(`Created ${user.role} account for ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });