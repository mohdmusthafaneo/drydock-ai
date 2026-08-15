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
