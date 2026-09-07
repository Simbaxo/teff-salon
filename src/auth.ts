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

                // Find an active TEFF login account
                const user = await prisma.user.findUnique({
                    where: {
                        email,
                    },
                });

                if (!user || !user.active) {
                    return null;
                }

                // Technician account are not allowed to use the app yet
                if (user.role === "TECHNICIAN") {
                    return null;
                }

                // Compare the submitted password with the stored hash
                const passwordMatches = await bcrypt.compare(
                    credentials.password,
                    user.passwordHash
                );

                if (!passwordMatches) {
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
            // Save TEFF=specific access data into the session token
            if (user) {
                token.role = user.role;
                token.employeeId = user.employeeId;
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