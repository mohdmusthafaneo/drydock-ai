"use client";

import type { ReactNode } from "react";
import { JiraMockSessionFromStore } from "@/components/integrations/jira-mock-session-from-store";
import { useAppData } from "@/lib/store";

/**
 * Prefer the mock Jira connect session when the evidence set is mock;
 * otherwise render live Jira connector cards from the server.
 */
export function JiraConnectSection({ live }: { live: ReactNode }) {
  const mode = useAppData((s) => s.data.meta.mode);
  const mockJira = useAppData((s) =>
    s.data.integrations.items.find(
      (i) => i.provider.toLowerCase() === "jira" && i.mockSession,
    ),
  );

  if (mode !== "live" && mockJira) {
    return <JiraMockSessionFromStore />;
  }

  return <>{live}</>;
}
