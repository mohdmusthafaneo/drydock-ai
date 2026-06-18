"use client";

import { useSearchParams } from "next/navigation";

const MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: {
    tone: "success",
    text: "GitHub connected successfully. Read-only access is active for delivery intelligence.",
  },
  connected_jira: {
    tone: "success",
    text: "Jira connected successfully. Read-only access is active.",
  },
  github_app_installed: {
    tone: "success",
    text: "GitHub App installed.",
  },
  github_app_missing_installation: {
    tone: "error",
    text: "GitHub App callback was missing the installation_id. Try installing again.",
  },
  github_app_invalid_installation: {
    tone: "error",
    text: "GitHub App callback returned an invalid installation_id. Please retry the install.",
  },
  github_app_persist_failed: {
    tone: "error",
    text: "We received the GitHub App install but couldn't store it. Please try again.",
  },
  oauth_not_configured: {
    tone: "error",
    text: "GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env (see README).",
  },
  jira_oauth_not_configured: {
    tone: "error",
    text: "Jira OAuth is not configured. Add ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET to .env.",
  },
  github_access_denied: {
    tone: "error",
    text: "GitHub authorization was cancelled.",
  },
  jira_access_denied: {
    tone: "error",
    text: "Atlassian authorization was cancelled.",
  },
  github_callback_failed: {
    tone: "error",
    text: "GitHub connection failed. Check OAuth app callback URL and credentials.",
  },
  jira_callback_failed: {
    tone: "error",
    text: "Jira connection failed. Check OAuth callback URL and credentials.",
  },
  github_org_mismatch: {
    tone: "error",
    text: "Organization mismatch during GitHub callback. Please try again.",
  },
  jira_org_mismatch: {
    tone: "error",
    text: "Organization mismatch during Jira callback.",
  },
  github_missing_params: {
    tone: "error",
    text: "Invalid GitHub callback. Missing code or state.",
  },
  jira_missing_params: {
    tone: "error",
    text: "Invalid Jira callback. Missing code or state.",
  },
};

export function IntegrationAlerts() {
  const params = useSearchParams();
  const connected = params.get("connected");
  const error = params.get("error");
  const key =
    connected === "github"
      ? "connected"
      : connected === "github_app"
        ? "github_app_installed"
        : connected === "jira"
          ? "connected_jira"
          : error ?? "";

  if (!key || !MESSAGES[key]) return null;

  const msg = MESSAGES[key];
  const isSuccess = msg.tone === "success";

  return (
    <div
      className={
        isSuccess
          ? "rounded-xl border border-dove/50 bg-sky-wash px-4 py-3 text-sm text-ink"
          : "rounded-xl border border-dove/50 bg-apricot-wash px-4 py-3 text-sm text-rust"
      }
      role="alert"
    >
      {msg.text}
    </div>
  );
}
