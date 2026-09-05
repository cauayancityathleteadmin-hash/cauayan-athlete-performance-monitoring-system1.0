import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "../../../lib/prisma";
import { ensureSchema } from "../../../lib/db-schema";
import { rateLimiters } from "../../../lib/rate-limit";
import { checkRateLimitDb } from "../../../lib/rate-limit-db";
import { isLocked, recordFailure, recordSuccess } from "../../../lib/login-protection";

async function auditLogin(identifier, success, detail) {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }, { coach: { coachCode: identifier.toUpperCase() } }] },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: {
      userId: user ? user.id : null,
      action: success ? "login" : "login_failed",
      entityType: "user",
      entityId: user ? user.id : null,
      description: detail || (success ? "Signed in." : "Sign-in attempt failed."),
    },
  });
  return user;
}

function normalizeHash(hash) {
  return hash?.replace(/^\$2y\$/, "$2b$");
}

const nextAuthSecret = process.env.NEXTAUTH_SECRET;
if (!nextAuthSecret && process.env.NODE_ENV === "production") {
  throw new Error("NEXTAUTH_SECRET must be set in production.");
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
      const dbRate = await checkRateLimitDb({ scope: "login", key: `login:${ip}`, limit: 30, windowMs: 15 * 60 * 1000 });
      if (!dbRate.allowed) return null;
      const lock = isLocked(identifier);
      if (lock.locked) return null;
      const user = await prisma.user.findFirst({
        where: { OR: [{ email: identifier }, { username: identifier }, { coach: { coachCode: identifier.toUpperCase() } }] },
        include: { coach: true },
      });
      if (!user || (user.status !== "active" && user.status !== "pending") || !(await bcrypt.compare(password, normalizeHash(user.passwordHash)))) {
        recordFailure(identifier);
        await auditLogin(identifier, false, "Sign-in attempt failed (wrong credentials or inactive account).");
        return null;
      }
      recordSuccess(identifier);
      await auditLogin(identifier, true, "Signed in successfully.");
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { id: String(user.id), role: user.role, email: user.email, name: user.coach ? `${user.coach.firstName} ${user.coach.lastName}` : user.username, mustChangePassword: user.mustChangePassword, canApproveCoaches: user.coach ? user.coach.canApproveCoaches : false };
    },
  })],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  jwt: { maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user, trigger, session }) { if (user) Object.assign(token, user); if (trigger === "update" && session?.mustChangePassword !== undefined) token.mustChangePassword = session.mustChangePassword; return token; },
    async session({ session, token }) { session.user = { id: token.id, name: token.name, email: token.email, role: token.role, mustChangePassword: token.mustChangePassword, canApproveCoaches: Boolean(token.canApproveCoaches) }; return session; },
  },
  events: {
    async signOut({ token }) {
      if (!token?.id) return;
      try {
        await prisma.auditLog.create({
          data: { userId: Number(token.id), action: "logout", entityType: "user", entityId: Number(token.id), description: "Signed out." },
        });
      } catch (error) {
        console.warn("Logout audit skipped:", error && error.message);
      }
    },
  },
  secret: nextAuthSecret,
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};

export default async function handler(req, res) {
  try {
    await ensureSchema();
  } catch (e) {
    console.warn("[nextauth] schema self-heal skipped:", e && e.message);
  }
  return NextAuth(authOptions)(req, res);
}