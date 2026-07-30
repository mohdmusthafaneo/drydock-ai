# AIDOS Conversations — Simple Grounded Q&A Assistant

**Status:** Current · **Last updated:** 2026-07-30  
**Audience:** Engineering (backend, frontend)

---

## 1. Summary

Conversations (`/agent-threads`) is a **single in-process AIDOS Assistant** chatbot. Humans ask project questions; the assistant answers in-thread using read-only tools over org context, Jira, releases, and the latest verified analysis runs from the four domain agents (QA, DevOps, productivity, governance).

This is **not** a multi-agent control plane. There is no Super Agent, no wakeups, no in-thread delegation, and no background chat agents.

### Locked product decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Thread model | Many threads — isolated context per topic |
| 2 | Assistant | One Mastra agent (`aidosAssistant`) run in-process |
| 3 | Tools | Read-only; session-scoped `organizationId` via RequestContext |
| 4 | Real-time UX | NDJSON stream from `POST .../messages` (text / thinking / tool cards) |
| 5 | Analysis data | Query persisted verified runs only — chat never triggers domain agents |

### What this is not

- Not a replacement for Approval Center (approvals remain outside chat).
- Not an agent hiring / heartbeat / wakeup system.
- Not automated execution — recommend-only answers.

---

## 2. Architecture

```
UI (/agent-threads)
  → POST /api/agent-threads/{id}/messages
  → buildChatContextMarkdown + createAidosRequestContext(session.organizationId)
  → runAidosAssistant → aidosAssistant.stream(+ toolsets)
  → NDJSON: thinking / text_delta / tool_start / tool_end / done
```

Tenancy is server-side: `organizationId` comes from the session into `RequestContext`, never from model input.

Domain agents (`qaAgent`, `devopsAgent`, `productivityAgent`, `governanceAgent`) continue to run via `agent-analysis-refresh` and their dashboards. Chat only **reads** their latest verified runs.

---

## 3. Assistant tools (12, read-only)

Org / delivery:

- `aidos_get_org_context`
- `aidos_list_recommendations` / `aidos_list_approvals` / `aidos_list_releases`
- `aidos_get_release_readiness`
- `aidos_get_integration_health`

Jira:

- `aidos_get_jira_context`
- `aidos_query_jira_jql`

Analysis runs (persisted only):

- `aidos_get_qa_analysis`
- `aidos_get_devops_analysis`
- `aidos_get_productivity_analysis`
- `aidos_get_governance_analysis`

Each analysis tool returns `analyzedAt` and a `stale` flag (older than 24h).

---

## 4. Key files

| Area | Path |
|------|------|
| Agent | `src/mastra/agents/aidos-assistant.ts` |
| Streaming bridge | `src/mastra/workflows/run-assistant.ts` |
| Tools | `src/mastra/tools/aidos/` |
| Chat API | `src/app/api/agent-threads/[id]/messages/route.ts` |
| UI | `src/components/agent-chat/` |
| Context builder | `src/lib/agent-chat/context.ts` |

---

## 5. Legacy notes

- Prisma still has `approval_request` / `approval_resolved` message kinds for historical rows; the UI renders them as plain system messages.
- In-thread approval cards and the chat decide route were removed. Use `/approvals` for governance decisions.
