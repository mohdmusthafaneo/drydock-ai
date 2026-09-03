import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "@/generated/prisma/client";
import {
  DEV_AUTH_SECRET_FALLBACK,
  LEGACY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/session-cookie";

const COOKIE_NAME = SESSION_COOKIE_NAME;
const MAX_AGE = SESSION_MAX_AGE;

export type SessionPayload = {
  userId: string;
  organizationId: string;
  email: string;
  name: string;
  role: UserRole;
};

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET || DEV_AUTH_SECRET_FALLBACK,
  );
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(COOKIE_NAME)?.value ??
    cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);
}
