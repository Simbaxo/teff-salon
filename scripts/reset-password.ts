import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.RESET_USER_EMAIL?.trim().toLowerCase();
  const newPassword = process.env.RESET_USER_PASSWORD;
  const resetConfirmation = process.env.RESET_CONFIRM;

  // Require both the target account and the new password.
  if (!email || !newPassword) {
    throw new Error(
      "RESET_USER_EMAIL and RESET_USER_PASSWORD are required"
    );
  }

    // Require an explicit confirmation phrase before changing any password.
    // This helps prevent accidental resets, especially against production data.
    if (resetConfirmation !== "TEFF_PASSWORD_RESET") {
        throw new Error(
            "RESET_CONFIRM must equal TEFF_PASSWORD_RESET"
        );
    }

  // Keep staff passwords reasonably strong for production use.
  if (newPassword.length < 10) {
    throw new Error("New password must be at least 10 characters long");
  }

  // Find the existing account before making any changes
  const user = await prisma.user.findUnique({
    where: {
        email,
    },
  });

  if (!user) {
    throw new Error(`No user exists with email ${email}`);
  }

  /// Technicians do not currently have access to the TEFF staff app
  // Password recovery is limited to accounts that actually use the app
  if (!["OWNER", "RECEPTIONIST"].includes(user.role)) {
    throw new Error(
        "Password reset is only available for OWNER and RECEPTIONIST accounts"
    );
  }

  // Hash the new password before storing it
  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    // Update the account with the new hashed password
    await tx.user.update({
        where: {
            id: user.id,
        },
        data: {
            passwordHash,
        },
    });

    // Clear failed-login attempts so the user is not still locked out
    // immediately after an administrative password reset
    await tx.loginAttempt.deleteMany({
        where: {
            email,
        },
    });
  });

  console.log(`Password reset completed for ${user.email}`);
}

main()
  .catch((error) => {
    console.error("Password reset failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });