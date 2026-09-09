"use client";

import type { ReactNode } from "react";
import { JiraMockSessionFromStore } from "@/components/integrations/jira-mock-session-from-store";
import { useAppData } from "@/lib/store";

/** Prefer the store Jira session card when present; otherwise render live connector UI. */
export function JiraConnectSection({ live }: { live: ReactNode }) {
  const jira = useAppData((s) =>
    s.data.integrations.items.find(
      (i) => i.provider.toLowerCase() === "jira" && i.mockSession,
    ),
  );

  if (jira) {
    return <JiraMockSessionFromStore />;
  }

  return <>{live}</>;
}
