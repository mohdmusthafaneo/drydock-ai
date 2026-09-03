import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { appUrl } from "@/lib/app-url";
import {
  DEV_AUTH_SECRET_FALLBACK,
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/session-cookie";

const COOKIE_NAME = SESSION_COOKIE_NAME;
const publicPaths = [
  "/",
  "/login",
  "/signup",
  "/healthz",
  "/readyz",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/connect/done",
  "/connect/error",
];

/** Bearer-auth routes — no session cookie required */
const publicPathPrefixes = [
  "/connect/",
  "/api/integrations/external/",
  "/api/cron/",
  "/api/platform/",
  "/api/internal/",
  "/api/webhooks/",
];

function isPublicPath(pathname: string): boolean {
  if (publicPaths.includes(pathname)) return true;
  return publicPathPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || DEV_AUTH_SECRET_FALLBACK,
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const correlationId =
    request.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();
  requestHeaders.set("x-correlation-id", correlationId);

  if (pathname === "/") {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  if (pathname === "/healthz" || pathname === "/readyz") {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  const token =
    request.cookies.get(COOKIE_NAME)?.value ??
    request.cookies.get(LEGACY_SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(appUrl("/login"));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    const response = NextResponse.redirect(appUrl("/login"));
    response.cookies.delete(COOKIE_NAME);
    response.cookies.delete(LEGACY_SESSION_COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
