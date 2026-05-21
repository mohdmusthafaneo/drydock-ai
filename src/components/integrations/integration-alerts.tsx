"use client";

import { useSearchParams } from "next/navigation";

const MESSAGES: Record<string, { tone: "success" | "error"; text: string }> = {
  connected: {
    tone: "success",
    text: "GitHub connected successfully. Read-only access is active for delivery intelligence.",
  },
  oauth_not_configured: {
    tone: "error",
    text: "GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env (see README).",
  },
  github_access_denied: {
    tone: "error",
    text: "GitHub authorization was cancelled.",
  },
  github_callback_failed: {
    tone: "error",
    text: "GitHub connection failed. Check OAuth app callback URL and credentials.",
  },
  github_org_mismatch: {
    tone: "error",
    text: "Organization mismatch during GitHub callback. Please try again.",
  },
  github_missing_params: {
    tone: "error",
    text: "Invalid GitHub callback. Missing code or state.",
  },
};

export function IntegrationAlerts() {
  const params = useSearchParams();
  const connected = params.get("connected");
  const error = params.get("error");
  const key = connected === "github" ? "connected" : error ?? "";

  if (!key || !MESSAGES[key]) return null;

  const msg = MESSAGES[key];
  const isSuccess = msg.tone === "success";

  return (
    <div
      className={
        isSuccess
          ? "rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 px-4 py-3 text-sm text-[#6ee7b7]"
          : "rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#fca5a5]"
      }
      role="alert"
    >
      {msg.text}
    </div>
  );
}
