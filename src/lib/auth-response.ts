import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import type { SessionPayload } from "@/lib/session";

const COOKIE_NAME = "aidos_session";
const MAX_AGE = 60 * 60 * 24 * 7;

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ||
      "aidos-dev-secret-change-me-in-production-32chars",
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
  return response;
}
