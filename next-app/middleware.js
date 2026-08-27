import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    if (path.startsWith("/admin") && token?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    if (path === "/change-password" && !token?.mustChangePassword) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;
        const publicPaths = ["/login", "/coach-register", "/api/auth"];
        const isPublicPath = publicPaths.some((p) => path.startsWith(p));
        if (isPublicPath) return true;
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/athletes",
    "/athletes/:path*",
    "/assessments",
    "/assessments/:path*",
    "/analytics",
    "/analytics/:path*",
    "/event-plans",
    "/event-plans/:path*",
    "/account",
    "/account/:path*",
    "/change-password",
    "/admin",
    "/admin/:path*",
    "/api/account/:path*",
    "/api/admin/:path*",
    "/api/athletes/:path*",
    "/api/assessments/:path*",
    "/api/event-plans/:path*",
  ],
};