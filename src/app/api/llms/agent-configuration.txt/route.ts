import { NextResponse } from "next/server";

const AGENT_CONFIGURATION = `# AIDOS Agent Runtime Configuration (Phase 5.5)

External agents (http/process adapters) receive wake context and authenticate
back to AIDOS using a short-lived API key for the heartbeat run.

## Environment variables (process adapter)

| Variable | Description |
|----------|-------------|
| AIDOS_AGENT_ID | Agent registry id |
| AIDOS_RUN_ID | Heartbeat run id — send as X-Run-Id on mutations |
| AIDOS_API_KEY | Ephemeral run API key (revoked when run completes) |
| AIDOS_API_URL | Base URL for agent API routes |
| AIDOS_ORGANIZATION_ID | Tenant scope |
| AIDOS_WAKEUP_SOURCE | timer · event · approval · delegation · on_demand |
| AIDOS_WAKEUP_REASON | Human-readable wake reason |
| AIDOS_WAKEUP_PAYLOAD | JSON string — event/release/approval context |

## HTTP adapter webhook body

POST to adapterConfigJson.url with JSON:

\`\`\`json
{
  "runId": "...",
  "agentId": "...",
  "organizationId": "...",
  "apiUrl": "https://your-aidos.example",
  "apiKey": "...",
  "wakeup": { "id": "...", "source": "event", "reason": "...", "payload": {} },
  "env": { "AIDOS_AGENT_ID": "...", ... }
}
\`\`\`

Set adapterConfigJson.async=true to treat HTTP 202 as success (fire-and-forget workers).

## Agent API (authenticated)

All mutations require headers:
- Authorization: Bearer <AIDOS_API_KEY>
- X-Run-Id: <AIDOS_RUN_ID>

Core routes:
- GET  /api/agents/me
- GET  /api/agents/me/inbox
- POST /api/agents/me/recommendations
- POST /api/agents/me/releases/{id}/assess
- POST /api/agents/me/delegate
- POST /api/agents/hire (Super Agent only)

See skills/aidos/SKILL.md and skills/aidos/references/api-reference.md for full contract.

## Adapter types

| adapterType | Behavior |
|-------------|----------|
| llm | In-process Anthropic Messages API + tool bridge (default) |
| http | POST wake payload to external webhook URL |
| process | Spawn shell command with AIDOS_* env vars |

## adapterConfigJson examples

HTTP:
\`\`\`json
{ "url": "https://worker.example/hook", "timeoutSec": 120, "async": true }
\`\`\`

Process:
\`\`\`json
{ "command": "node /opt/aidos-agent/run.js", "cwd": "/opt/aidos-agent", "timeoutSec": 300 }
\`\`\`
`;

export async function GET() {
  return new NextResponse(AGENT_CONFIGURATION, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
