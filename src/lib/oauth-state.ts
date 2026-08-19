import { SignJWT, jwtVerify } from "jose";

const STATE_MAX_AGE = 60 * 10;

export type OAuthState =
  | { flow: "session"; organizationId: string; userId: string }
  | {
      flow: "external";
      organizationId: string;
      inviteId: string;
      provider: "GITHUB" | "JIRA" | "SLACK";
      createdById: string;
    };

function getSecret() {
  return new TextEncoder().encode(
    process.env.AUTH_SECRET ||
      "aidos-dev-secret-change-me-in-production-32chars",
  );
}

export async function signOAuthState(payload: OAuthState) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifyOAuthState(token: string): Promise<OAuthState> {
  const { payload } = await jwtVerify(token, getSecret());
  const raw = payload as Record<string, unknown>;

  if (raw.flow === "external") {
    return parseExternalOAuthState(raw);
  }

  if (typeof raw.organizationId !== "string" || typeof raw.userId !== "string") {
    throw new Error("Invalid OAuth state");
  }

  return {
    flow: "session",
    organizationId: raw.organizationId,
    userId: raw.userId,
  };
}

function isExternalProvider(value: unknown): value is "GITHUB" | "JIRA" | "SLACK" {
  return value === "GITHUB" || value === "JIRA" || value === "SLACK";
}

function parseExternalOAuthState(raw: Record<string, unknown>) {
  if (
    typeof raw.organizationId !== "string" ||
    typeof raw.inviteId !== "string" ||
    typeof raw.createdById !== "string" ||
    !isExternalProvider(raw.provider)
  ) {
    throw new Error("Invalid external OAuth state");
  }
  return {
    flow: "external" as const,
    organizationId: raw.organizationId,
    inviteId: raw.inviteId,
    provider: raw.provider,
    createdById: raw.createdById,
  };
}
