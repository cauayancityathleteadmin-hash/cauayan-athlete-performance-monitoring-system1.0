import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { rateLimiters } from "../../../lib/rate-limit";

function normalizeHash(hash) {
  return hash?.replace(/^\$2y\$/, "$2b$");
}

export const authOptions = {
  providers: [CredentialsProvider({
    name: "Credentials",
    credentials: { identifier: { label: "Username, email, or coach code", type: "text" }, password: { label: "Password", type: "password" } },
    async authorize(credentials, request) {
      const identifier = String(credentials?.identifier ?? "").trim().toLowerCase();
      const password = String(credentials?.password ?? "");
      if (!identifier || !password || identifier.length > 191 || password.length > 200) return null;
      const forwarded = request?.headers?.["x-forwarded-for"] ?? "unknown";
      const ip = String(forwarded).split(",")[0].trim();
      const rate = rateLimiters.login(`login:${ip}:${identifier}`);
      if (!rate.allowed) return null;
      const user = await prisma.user.findFirst({
        where: { OR: [{ email: identifier }, { username: identifier }, { coach: { coachCode: identifier.toUpperCase() } }] },
        include: { coach: true },
      });
      if (!user || user.status !== "active" || !(await bcrypt.compare(password, normalizeHash(user.passwordHash)))) return null;
      return { id: String(user.id), role: user.role, email: user.email, name: user.coach ? `${user.coach.firstName} ${user.coach.lastName}` : user.username, mustChangePassword: user.mustChangePassword };
    },
  })],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  jwt: { maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, trigger, session }) { if (user) Object.assign(token, user); if (trigger === "update" && session?.mustChangePassword !== undefined) token.mustChangePassword = session.mustChangePassword; return token; },
    async session({ session, token }) { session.user = { id: token.id, name: token.name, email: token.email, role: token.role, mustChangePassword: token.mustChangePassword }; return token; },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);