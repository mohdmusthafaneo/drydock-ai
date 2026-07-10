/** Mask JWTs / Bearer tokens before embedding or persistence (RFC §12.5). */
const BEARER_RE =
  /(authorization:\s*bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_ISH_RE = /\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\b/g;

export function redactSecrets(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(BEARER_RE, "$1[REDACTED]")
    .replace(JWT_ISH_RE, "[REDACTED_JWT]");
}
