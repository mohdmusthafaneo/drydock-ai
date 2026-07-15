export const AIDOS_TOOL_IDS = [
  "aidos_get_org_context",
  "aidos_list_recommendations",
  "aidos_list_approvals",
  "aidos_list_releases",
  "aidos_get_release_readiness",
  "aidos_get_jira_context",
  "aidos_get_code_analysis",
  "aidos_get_integration_health",
  "aidos_list_incidents",
  "aidos_list_compliance_findings",
  "aidos_list_predictions",
  "aidos_query_jira_jql",
] as const;

export type AidosToolId = (typeof AIDOS_TOOL_IDS)[number];
