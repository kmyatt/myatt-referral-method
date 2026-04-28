import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/constants";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  const protectedPrefixes = [
    "/dashboard",
    "/api/customer",
    "/api/business",
    "/api/admin",
    "/api/onboarding",
  ];
  const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/api/:path*"],
};

