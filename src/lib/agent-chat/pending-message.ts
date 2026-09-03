/** Session-scoped bootstrap for new-chat first turn (client-only). */

const KEY_PREFIX = "drydock:pending-message:";

/** Threads currently starting their first streamed turn (survives Strict Mode remount). */
const bootstrapInFlight = new Set<string>();

export function stashPendingMessage(threadId: string, content: string) {
  if (typeof window === "undefined") return;
  const trimmed = content.trim();
  if (!threadId || !trimmed) return;
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${threadId}`, trimmed);
  } catch {
    // sessionStorage may be unavailable — user can resend.
  }
}

export function peekPendingMessage(threadId: string): string | null {
  if (typeof window === "undefined" || !threadId) return null;
  try {
    return sessionStorage.getItem(`${KEY_PREFIX}${threadId}`)?.trim() || null;
  } catch {
    return null;
  }
}

export function clearPendingMessage(threadId: string) {
  if (typeof window === "undefined" || !threadId) return;
  try {
    sessionStorage.removeItem(`${KEY_PREFIX}${threadId}`);
  } catch {
    // ignore
  }
}

export function beginBootstrap(threadId: string): boolean {
  if (bootstrapInFlight.has(threadId)) return false;
  bootstrapInFlight.add(threadId);
  return true;
}

export function endBootstrap(threadId: string) {
  bootstrapInFlight.delete(threadId);
}
