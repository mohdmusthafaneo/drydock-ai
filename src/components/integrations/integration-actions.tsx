"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function GitHubOAuthConnect() {
  return (
    <Button size="sm" asChild>
      <Link href="/api/integrations/github/authorize">Connect with GitHub</Link>
    </Button>
  );
}

export function JiraOAuthConnect({
  label = "Connect with Jira",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "brand" | "secondary" | "ghost";
}) {
  return (
    <Button size="sm" variant={variant} asChild>
      <Link href="/api/integrations/jira/authorize">{label}</Link>
    </Button>
  );
}

export function SlackOAuthConnect({
  label = "Add to Slack",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "brand" | "secondary" | "ghost";
}) {
  return (
    <Button size="sm" variant={variant} asChild>
      <Link href="/api/integrations/slack/authorize">{label}</Link>
    </Button>
  );
}

export function StubConnectButton({ provider }: { provider: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Dev-only stub — never render in production builds.
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  async function connect() {
    setLoading(true);
    await fetch("/api/integrations/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ provider }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="sm" variant="secondary" disabled={loading} onClick={connect}>
      {loading ? "Connecting…" : "Connect (dev stub)"}
    </Button>
  );
}

export function DisconnectButton({ provider }: { provider: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function disconnect() {
    setLoading(true);
    await fetch("/api/integrations/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ provider }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="sm" variant="ghost" disabled={loading} onClick={disconnect}>
      {loading ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
