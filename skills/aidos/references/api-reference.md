# AIDOS Agent API Reference

Base URL: `{AIDOS_API_URL}` (no trailing slash)

## GET /api/agents/me

Returns agent identity, permissions, runtime config, manager chain.

```json
{
  "agent": { "id", "agentType", "displayName", "status", "autonomyMode", "adapterType" },
  "organizationId": "...",
  "permissions": { "canCreateAgents": true },
  "runtimeConfig": { "heartbeat": { ... } },
  "managerChain": [],
  "directReports": [
    { "id": "...", "agentType": "QA_INTELLIGENCE", "role": "qa_intelligence", "displayName": "...", "status": "IDLE" }
  ],
  "heartbeatRunId": "..."
}
```

`directReports` is populated for Super Agent only (specialists that report to this agent).

## POST /api/agents/me/delegate

Super Agent only. Enqueue a delegation wakeup for a specialist.

Body (provide `targetRole` or `targetAgentId`):

```json
{
  "targetRole": "qa_intelligence",
  "reason": "release.detected",
  "payload": { "releaseId": "<releaseId>" }
}
```

Success:

```json
{
  "ok": true,
  "wakeupId": "...",
  "coalesced": false,
  "targetAgent": { "id": "...", "displayName": "QA Intelligence", "role": "qa_intelligence" }
}
```

## GET /api/agents/me/inbox

Query: `limit` (default 20, max 50), optional `approvalId`, `decision`.

```json
{
  "agent": { "id", "agentType", "displayName" },
  "items": [
    {
      "id": "release_assess:<releaseId>",
      "workType": "release_assess",
      "entityType": "Release",
      "entityId": "<releaseId>",
      "status": "pending",
      "priority": 0,
      "title": "Assess release: ...",
      "metadata": { "environment": "PRODUCTION", "version": "1.0.0" }
    }
  ],
  "summary": { "total": 1, "pending": 1, "inProgress": 0, "returned": 1 }
}
```

Work item id format: `{workType}:{entityId}` — pass entire string to `aidos_complete_work_item`.

## POST /api/agents/me/releases/{releaseId}/assess

Headers: `X-Run-Id` required when run is active.

Assesses a `DETECTED` release; creates recommendation + approval; updates release status.

Success:

```json
{
  "ok": true,
  "releaseId": "...",
  "recommendationId": "...",
  "assessment": {
    "summary": "...",
    "governanceRiskScore": 42,
    "readinessScore": 78,
    "riskLevel": "MEDIUM",
    "primaryRecommendation": "..."
  }
}
```

Skipped (400):

```json
{ "ok": false, "skipped": true, "reason": "...", "releaseId": "..." }
```

## POST /api/agents/me/recommendations

Body:

```json
{
  "title": "string",
  "description": "string",
  "rationale": "string",
  "confidence": 0.85,
  "impact": "MEDIUM",
  "releaseId": "optional",
  "requiredRole": "QA_LEAD",
  "createApproval": true
}
```

Response: `{ "ok": true, "recommendationId": "...", "approvalId": "...", "coalesced": false }`

## POST /api/agents/me/work-items/{workItemId}/complete

URL-encode the work item id (contains `:`).

Response: `{ "ok": true, "itemId": "...", "completed": true, "message": "..." }`

## Errors

| Status | Meaning |
|--------|---------|
| 401 | Invalid or missing API key |
| 403 | Tool not allowed for agent type |
| 400 | Invalid run id or request body |
| 404 | Release or entity not found |
