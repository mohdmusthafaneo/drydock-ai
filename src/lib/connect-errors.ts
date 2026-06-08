export type ConnectErrorCode =
  | "expired"
  | "used"
  | "revoked"
  | "invalid"
  | "already_connected"
  | "jira_denied"
  | "github_denied"
  | "jira_no_sites"
  | "config_missing"
  | "callback_failed"
  | "provider_mismatch";

export const CONNECT_ERROR_MESSAGES: Record<
  ConnectErrorCode,
  { title: string; message: string; action: string }
> = {
  expired: {
    title: "Link expired",
    message: "This link expired.",
    action: "Ask your AIDOS admin to send a new link.",
  },
  used: {
    title: "Link already used",
    message: "This link was already used.",
    action: "Ask your admin for a new link if the connection failed.",
  },
  revoked: {
    title: "Link revoked",
    message: "This link was revoked.",
    action: "Ask your admin to generate a new one.",
  },
  invalid: {
    title: "Invalid link",
    message: "This link is not valid.",
    action: "Check the URL or request a new link.",
  },
  already_connected: {
    title: "Already connected",
    message: "This integration is already connected for the organization.",
    action: "Nothing required — your admin can manage it in AIDOS.",
  },
  jira_denied: {
    title: "Authorization cancelled",
    message: "Atlassian authorization was cancelled or denied.",
    action: "Retry the link or contact your admin.",
  },
  github_denied: {
    title: "Installation cancelled",
    message: "GitHub installation was cancelled.",
    action: "Retry the link.",
  },
  jira_no_sites: {
    title: "No Jira sites authorized",
    message: "No Jira sites were authorized.",
    action: "Re-run the link and select a site on the Atlassian screen.",
  },
  config_missing: {
    title: "Not configured",
    message: "Integration is not configured on the server.",
    action: "Contact AIDOS support.",
  },
  callback_failed: {
    title: "Connection failed",
    message: "Something went wrong completing the connection.",
    action: "Retry once, then ask your admin for a new link.",
  },
  provider_mismatch: {
    title: "Invalid link",
    message: "This link does not match the requested provider.",
    action: "Check the URL or request a new link.",
  },
};

export function resolveConnectError(code: string | null | undefined) {
  const key = (code ?? "invalid") as ConnectErrorCode;
  return CONNECT_ERROR_MESSAGES[key] ?? CONNECT_ERROR_MESSAGES.invalid;
}

export function providerLabel(provider: string | null | undefined): string {
  if (provider === "jira") return "Jira";
  if (provider === "github") return "GitHub";
  return "Integration";
}
