# Deployment-Time Customization Model

## Overview

AIDOS is deployed as a single multi-tenant SaaS platform. Customization is scoped **per deployment/integration partner**, not per user role within an organization. This document describes what exists today, what does not exist, and the configuration points available to an integration partner deploying AIDOS for their customers.

---

## What Exists: Integration Partner Customization Points

### 1. Approval Level Label Overrides

Each organization can customize the human-readable labels that appear on approval cards, release summaries, and agent routing strips. These labels are stored in the organization's `GovernancePolicy` record under `approvalLevelLabels`.

**Configuration path:** `GovernancePolicy.approvalLevelLabels` (JSON object)

**Default labels:**

| Level | Default label |
|-------|---------------|
| 1 | Developer |
| 2 | QA Lead |
| 3 | Engineering Lead |
| 4 | Org Admin |

**Customization example (per-org, set via API or admin UI):**

```json
{
  "level1": "Developer",
  "level2": "Release Manager",
  "level3": "VP Engineering",
  "level4": "Org Admin"
}
```

**Where labels are surfaced:**
- Approval cards on `/approvals` and `/recommendations`
- Release detail header strips
- Agent decision routing strips on `/qa`, `/devops`, `/code-health`, `/productivity`
- Dashboard "For your [role]" CTAs

**Implementation:** `src/lib/governance/presentation.ts` — `displayRoleLabel(role, customLabels)` merges `DEFAULT_APPROVAL_LEVEL_LABELS` with org-supplied labels, tries role-keyed lookup first then level-keyed, falls back to `humanize()`.

---

### 2. Partner Token Link (External Partner Onboarding)

External integration partners (e.g., a Jira reseller or SI) can set up integrations on behalf of their end customers using one-time token links. These links are **shared across all organizations** — the token encodes the partner identity, not the end customer's org identity.

**Routes:**
- `/connect/jira/[token]` — partner Jira OAuth handoff
- `/connect/slack/[token]` — partner Slack OAuth handoff
- `/connect/github/[token]` — partner GitHub OAuth handoff

**Behavior:**
1. Partner generates a one-time token tied to their integration offer.
2. End customer clicks the link, authenticates to the partner's OAuth app, and AIDOS receives the partner token + customer OAuth tokens.
3. AIDOS creates or associates the `Integration` record under the customer's `organizationId`.
4. Token is single-use; subsequent attempts return an error.

**Token storage:** Encrypted in `Integration.metadataJson` using AES-256-GCM keyed from `AUTH_SECRET`. Tokens are rotatable via "Manage connection" → "Rotate token" in the integration panel.

**Security note:** Tokens expire and are not reusable. The partner token link page shows a clear "Set up integration on behalf of customer" banner.

---

### 3. Integration Connection Configuration

Each integration type (Jira, GitHub, Slack, Grafana, Prometheus, AWS) is configured independently per organization. There is no global deployment-level override — each org connects its own integrations.

**Per-integration configuration:**

| Integration | Auth model | Token storage |
|-------------|------------|---------------|
| Jira | Platform OAuth app (`ATLASSIAN_CLIENT_ID`/`SECRET` shared per deployment); per-org OAuth tokens | `Integration.metadataJson`, AES-256-GCM encrypted |
| GitHub | GitHub App install — one app per deployment; per-org install tokens | `Integration.metadataJson`, AES-256-GCM encrypted |
| Slack | Bot tokens — one Slack app per deployment; per-org bot tokens | `Integration.metadataJson`, AES-256-GCM encrypted |
| Grafana | API key per org | `Integration.metadataJson`, AES-256-GCM encrypted |
| Prometheus | URL + token per org | `Integration.metadataJson`, AES-256-GCM encrypted |
| AWS (Cloud Hygiene) | Single AWS account per org (Phase 1; multi-account not available) | `Integration.metadataJson`, AES-256-GCM encrypted |

---

### 4. Environment Variables for Deployment Behavior

The following environment variables affect AIDOS behavior at deploy time. These are deployment-level — they apply to all organizations on that deployment.

| Variable | Effect |
|----------|--------|
| `AIDOS_PROCESS_ROLE` | `web` or `worker` — selects runtime mode in `docker/entrypoint.sh` |
| `AUTH_SECRET` | AES-256-GCM key for integration token encryption |
| `ANTHROPIC_API_KEY` | Required for agent heartbeat + LLM calls |
| `ANTHROPIC_BASE_URL` | Override for Claude-compatible endpoints (development, air-gapped) |
| `DATABASE_URL` | Postgres connection string |
| `WORKER_QUEUES` | Which pg-boss queues this worker serves (comma-separated) |
| `ENABLE_CONNECTED_TOOLS_PRESELECT` | Feature flag: pre-select connected integrations in Discovery wizard (default off) |

---

## What Does Not Exist: Per-Role Views

Today there are **no per-user-role views** within an organization. AIDOS is a leadership-only surface:

- Every authenticated user in an organization sees the same data: the same releases, approvals, incidents, recommendations, and agent outputs.
- There is no viewer/approver/engineer split.
- There is no row-level security per user role.
- There is no content personalization based on the user's approval level label.

**The `approvalLevelLabels` system (above) is a label customization, not a role-based access control system.** It allows an organization to rename "QA Lead" to "Release Manager" in their context, but it does not restrict what any given user can see or do.

**Roadmap note (TKT-077):** A future phase may introduce per-recipient routing — e.g., a release manager sees different briefing content than an executive. The `recipient_id` placeholder on incident correlation is not yet wired to any routing logic.

---

## Summary: What Can Be Customized Today

| Customization | Per Deployment | Per Org | Per User |
|---------------|----------------|---------|----------|
| Approval level labels | — | ✅ | — |
| Partner token links | ✅ | — | — |
| Integration connections | — | ✅ | — |
| Integration token encryption key | ✅ (AUTH_SECRET) | — | — |
| Process role (web/worker) | ✅ | — | — |
| Feature flags (e.g., preselect) | ✅ | — | — |
| Per-user role views | ❌ | ❌ | ❌ |

---

## Related Tickets

- **TKT-002** — Approval level label overrides (implemented)
- **TKT-018** — Partner token link documentation
- **TKT-077** — Future per-recipient routing roadmap note
- **TKT-074** — Leadership-only access model documentation
