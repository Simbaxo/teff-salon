import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

export const { auth, handlers, signIn, signOut } = NextAuth({
    providers: [
        Credentials({
            credentials: {
                email: {},
                password: {},
            },

            async authorize(credentials) {
                // Make sure both login fields were provided
                if (
                    typeof credentials.email !== "string" ||
                    typeof credentials.password !== "string"
                ) {
                    return null;
                }

                const email = credentials.email.trim().toLowerCase();

                // Limit repeated failed login attempts for the same email
                const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

                // Remove expired login attempts so the table does not grow indefinitely
                await prisma.loginAttempt.deleteMany({
                    where: {
                        email,
                        createdAt: {
                            lt: fifteenMinutesAgo,
                        },
                    },
                });

                const recentFailedAttempts = await prisma.loginAttempt.count({
                    where: {
                        email,
                        createdAt: {
                            gte: fifteenMinutesAgo,
                        },
                    },
                });

                if (recentFailedAttempts >= 5) {
                    return null;
                }

                // Find an active TEFF login account
                const user = await prisma.user.findUnique({
                    where: {
                        email,
                    },
                });

                if (!user || !user.active) {
                    await prisma.loginAttempt.create({
                        data: { email },
                    });

                    return null;
                }

                // Technician account are not allowed to use the app yet
                if (user.role === "TECHNICIAN") {
                    await prisma.loginAttempt.create({
                        data: { email },
                    });

                    return null;
                }

                // Compare the submitted password with the stored hash
                const passwordMatches = await bcrypt.compare(
                    credentials.password,
                    user.passwordHash
                );

                if (!passwordMatches) {
                    await prisma.loginAttempt.create({
                        data: { email },
                    });

                    return null;
                }

                // Auth.js requires the user ID as a string
                return {
                    id: String(user.id),
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    employeeId: user.employeeId,
                };
            },
        }),
    ],

    callbacks: {
        async jwt({ token, user }) {
            // Save TEFF-specific access data when the user first signs in.
            if (user) {
                token.role = user.role;
                token.employeeId = user.employeeId;
                return token;
            }

            // Revalidate existing sessions against the current database user.
            if (token.sub) {
                const currentUser = await prisma.user.findUnique({
                    where: {
                        id: Number(token.sub),
                    },
                    select: {
                        active: true,
                        role: true,
                        employeeId: true
                    },
                });

                // Invalidate the session if the account was removed or deactivated.
                if (!currentUser || !currentUser.active) {
                    return null;
                }

                // Keep permissions synchronized with the current database values
                token.role = currentUser.role;
                token.employeeId = currentUser.employeeId;
            }
            
            return token;
        },

        async session({ session, token }) {
            // Expose the TEFF role and employee link to server/client session checks
            if (session.user) {
                session.user.id = token.sub ?? "";
                session.user.role = token.role;
                session.user.employeeId = token.employeeId;
            }

            return session;
        }
    }
});