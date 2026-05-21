import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGitHubWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export function parseGitHubWebhookEvent(
  headers: Headers,
  payload: Record<string, unknown>,
): { eventType: string; action: string } {
  const ghEvent = headers.get("x-github-event") ?? "unknown";
  const action = String(payload.action ?? ghEvent);
  return { eventType: `github.${ghEvent}`, action };
}

export function githubWebhookSeverity(
  event: string,
  payload: Record<string, unknown>,
): "info" | "warning" | "error" {
  const action = String(payload.action ?? "");
  if (event === "workflow_run") {
    const conclusion = (payload.workflow_run as { conclusion?: string } | undefined)?.conclusion;
    if (conclusion === "failure") return "error";
    if (conclusion === "success") return "info";
    return "warning";
  }
  if (action === "closed" && (payload.pull_request as { merged?: boolean })?.merged) {
    return "info";
  }
  return "info";
}
