import { NextResponse } from "next/server";

const AGENT_CONFIGURATION = `# AIDOS Assistant Configuration

AIDOS uses a single in-process Mastra assistant for operational chat.
Questions about the organization, Jira/GitHub delivery signals, releases,
recommendations, approvals, compliance, incidents, and predictions are
answered with read-only grounding tools.

## Chat API (session cookie)

- GET  /api/agent-threads
- POST /api/agent-threads
- GET  /api/agent-threads/{id}
- POST /api/agent-threads/{id}/messages  (streams NDJSON assistant reply)

## Assistant tools (read-only)

- aidos_get_org_context
- aidos_list_recommendations / aidos_list_approvals / aidos_list_releases
- aidos_get_release_readiness
- aidos_get_jira_context / aidos_query_jira_jql
- aidos_get_code_analysis / aidos_get_integration_health
- aidos_list_incidents / aidos_list_compliance_findings / aidos_list_predictions

Governance product surfaces (recommendations, approvals, releases) remain
human-driven outside chat. The assistant does not hire, delegate, or execute
write tools.
`;

export async function GET() {
  return new NextResponse(AGENT_CONFIGURATION, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
