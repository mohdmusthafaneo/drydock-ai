import type { ReactNode } from "react";

/** Live Jira OAuth connector. The store mock session does not replace this card. */
export function JiraConnectSection({ live }: { live: ReactNode }) {
  return <>{live}</>;
}
