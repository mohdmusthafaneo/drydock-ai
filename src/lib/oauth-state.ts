import { SignJWT, jwtVerify } from "jose";

const STATE_MAX_AGE = 60 * 10;

export type OAuthState = {
  organizationId: string;
  userId: string;
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

export async function verifyOAuthState(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as unknown as OAuthState;
}
