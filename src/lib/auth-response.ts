import { SignJWT } from "jose";
import { NextResponse } from "next/server";
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

export async function jsonWithSession(
  payload: SessionPayload,
  body: Record<string, unknown>,
  status = 200,
) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

  const response = NextResponse.json(body, { status });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  response.cookies.delete(LEGACY_SESSION_COOKIE_NAME);
  return response;
}
