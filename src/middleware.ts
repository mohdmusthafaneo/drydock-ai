import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
const COOKIE_NAME = "aidos_session";
const publicPaths = [
  "/",
  "/login",
  "/signup",
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
  "/api/platform/",
  "/api/agents/me",
  "/api/agents/hire",
  "/api/webhooks/",
];

function isPublicPath(pathname: string): boolean {
  if (publicPaths.includes(pathname)) return true;
  return publicPathPrefixes.some((prefix) => pathname.startsWith(prefix));
}

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ||
      "aidos-dev-secret-change-me-in-production-32chars",
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  if (pathname === "/") {
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

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
