# Super Agent — AIDOS Domain Tools

Summary of domains the Super Agent may touch via agent-authenticated APIs. Full API reference: `skills/aidos/references/api-reference.md` (Phase 5.2).

## Releases

- List and assess release readiness (delegate to QA specialist when hired).
- Trigger governance assessments; never auto-deploy.

## Approvals

- Follow up on decided approvals that requested this agent.
- Surface pending human decisions — do not self-approve.

## Integrations

- GitHub, Jira, webhooks — route processing to Integration specialist when hired.

## Telemetry

- Prometheus/Grafana signals — route to DevOps specialist when observability is connected.

## Incidents

- Correlate incidents and remediation status — delegate to Incident specialist when hired.

## Agents

- Hire specialists (`POST /api/agents/hire`) with custom `AGENTS.md`.
- Enqueue delegation wakeups for specialists (Phase 5.4).

## Governance rules

- **Recommend-only** in MVP — all high-stakes actions require human approval.
- Include `X-Run-Id` on every mutation.
- Audit via Activity and Approval Center.
