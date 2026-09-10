import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { appUrl } from "@/lib/app-url";
import type { SessionPayload } from "@/lib/session";
import {
  DEV_AUTH_SECRET_FALLBACK,
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/session-cookie";

const COOKIE_NAME = SESSION_COOKIE_NAME;
const MAX_AGE = SESSION_MAX_AGE;

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || DEV_AUTH_SECRET_FALLBACK,
  );
}

async function sessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
}

function applySessionCookies(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  response.cookies.delete(LEGACY_SESSION_COOKIE_NAME);
}

export async function jsonWithSession(
  payload: SessionPayload,
  body: Record<string, unknown>,
  status = 200,
) {
  const token = await sessionToken(payload);
  const response = NextResponse.json(body, { status });
  applySessionCookies(response, token);
  return response;
}

/** HTML form login fallback — set cookie and 303 to the landing path. */
export async function redirectWithSession(
  payload: SessionPayload,
  redirectTo: string,
) {
  const token = await sessionToken(payload);
  const response = NextResponse.redirect(appUrl(redirectTo), 303);
  applySessionCookies(response, token);
  return response;
}
