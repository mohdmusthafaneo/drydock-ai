import { timingSafeEqual } from "node:crypto";

const HEADER = "authorization";

function readBearerToken(request: Request): string | null {
  const header = request.headers.get(HEADER);
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Validates `Authorization: Bearer <PLATFORM_WORKER_SECRET>`. */
export function verifyPlatformWorkerRequest(request: Request): boolean {
  const expected = process.env.PLATFORM_WORKER_SECRET?.trim();
  if (!expected) return false;

  const token = readBearerToken(request);
  if (!token) return false;

  return secretsMatch(token, expected);
}

export function platformWorkerNotConfigured(): boolean {
  return !process.env.PLATFORM_WORKER_SECRET?.trim();
}
