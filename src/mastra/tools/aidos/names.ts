import type { AgentToolName } from "@/lib/agent-control-plane/tools/registry";

export const AIDOS_TOOL_IDS = [
  "aidos_get_me",
  "aidos_get_inbox",
  "aidos_assess_release",
  "aidos_list_compliance_findings",
  "aidos_query_jira_jql",
  "aidos_create_recommendation",
  "aidos_complete_work_item",
  "aidos_hire_agent",
  "aidos_complete_initialization",
  "aidos_delegate_wakeup",
  "aidos_invite_agent_to_thread",
  "aidos_post_thread_message",
  "aidos_close_thread",
  "aidos_reopen_thread",
  "aidos_await_human_input",
  "aidos_request_approval",
] as const;

export type AidosToolId = (typeof AIDOS_TOOL_IDS)[number];

export const TOOL_TO_REGISTRY: Record<AidosToolId, AgentToolName | null> = {
  aidos_get_me: null,
  aidos_get_inbox: null,
  aidos_assess_release: "assess_release",
  aidos_list_compliance_findings: "read_compliance_findings",
  aidos_query_jira_jql: "query_jira_jql",
  aidos_create_recommendation: "create_recommendation",
  aidos_complete_work_item: null,
  aidos_hire_agent: "hire_agent",
  aidos_complete_initialization: null,
  aidos_delegate_wakeup: null,
  aidos_invite_agent_to_thread: null,
  aidos_post_thread_message: null,
  aidos_close_thread: null,
  aidos_reopen_thread: null,
  aidos_await_human_input: null,
  aidos_request_approval: null,
};

export const SPECIALIST_ROLE_VALUES = [
  "qa_intelligence",
  "devops_intelligence",
  "governance",
  "incident_correlation",
  "integration",
] as const;

export const APPROVAL_ROLE_VALUES = [
  "QA_LEAD",
  "DEVOPS_LEAD",
  "ENGINEERING_MANAGER",
  "ORG_ADMIN",
] as const;

export const IMPACT_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
