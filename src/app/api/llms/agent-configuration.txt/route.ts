import { NextResponse } from "next/server";

const AGENT_CONFIGURATION = `# AIDOS Assistant Configuration

AIDOS uses a single in-process Mastra assistant for operational chat.
Questions about the organization, Jira delivery signals, releases,
recommendations, approvals, integration health, and the latest verified
QA / DevOps / productivity / governance analysis runs are answered with
read-only grounding tools.

## Chat API (session cookie)

- GET  /api/agent-threads
- POST /api/agent-threads
- GET  /api/agent-threads/{id}
- POST /api/agent-threads/{id}/messages  (streams NDJSON assistant reply)
- POST /api/agent-chat/warmup           (warms Mastra singleton)

## Assistant tools (read-only)

- aidos_get_org_context
- aidos_list_recommendations / aidos_list_approvals / aidos_list_releases
- aidos_get_release_readiness
- aidos_get_jira_context / aidos_query_jira_jql
- aidos_get_integration_health
- aidos_get_qa_analysis / aidos_get_devops_analysis
- aidos_get_productivity_analysis / aidos_get_governance_analysis

Domain agents still run via agent-analysis-refresh and their dashboards.
Chat only reads persisted verified runs; it does not trigger analysis.

Governance product surfaces (recommendations, approvals, releases) remain
human-driven outside chat. The assistant does not hire, delegate, or execute
write tools.
`;

export async function GET() {
  return new NextResponse(AGENT_CONFIGURATION, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
