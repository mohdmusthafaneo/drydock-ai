/**
 * Determines the actor type for an audit log entry.
 * Used to classify who/what initiated an action.
 */
export function determineActorType(
  userId?: string | null,
  action?: string,
): "human" | "system" | "integration" {
  if (userId) return "human";

  const INTEGRATION_PREFIXES = [
    "integration.",
    "sync.",
    "prometheus.",
    "github.",
    "jira.",
    "aws.",
    "grafana.",
    "delivery_dna.",
    "connect.",
  ];

  if (action && INTEGRATION_PREFIXES.some((p) => action.startsWith(p))) {
    return "integration";
  }

  return "system";
}

/**
 * Returns true for actions that represent read-only operations
 * (e.g. schema introspection, telemetry ingestion) and should not
 * appear in the compliance audit log.
 */
export function isAuditReadOnlyAction(action: string): boolean {
  const READ_ONLY_PREFIXES = [
    "github.schema.",
    "jira.schema.",
    "code_analysis.analyzed",
    "telemetry.events.ingested",
    "telemetry.ingested",
  ];
  return READ_ONLY_PREFIXES.some((prefix) => action.startsWith(prefix));
}

/**
 * Returns the Prisma filter to exclude read-only audit log entries.
 */
export function auditReadOnlyFilter(): {
  NOT: { action: { startsWith: string } }[];
} {
  return {
    NOT: [
      { action: { startsWith: "github.schema." } },
      { action: { startsWith: "jira.schema." } },
      { action: { startsWith: "code_analysis.analyzed" } },
      { action: { startsWith: "telemetry.events.ingested" } },
      { action: { startsWith: "telemetry.ingested" } },
    ],
  };
}
