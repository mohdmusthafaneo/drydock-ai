export const AIDOS_TOOL_IDS = [
  "aidos_get_org_context",
  "aidos_list_recommendations",
  "aidos_list_approvals",
  "aidos_list_releases",
  "aidos_get_release_readiness",
  "aidos_get_jira_context",
  "aidos_query_jira_jql",
  "aidos_get_integration_health",
  "aidos_get_qa_analysis",
  "aidos_get_devops_analysis",
  "aidos_get_productivity_analysis",
  "aidos_get_governance_analysis",
] as const;

export type AidosToolId = (typeof AIDOS_TOOL_IDS)[number];
