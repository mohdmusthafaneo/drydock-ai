# Super Agent — Initialization Playbook

Run this playbook on heartbeats until `organization.agentTeamInitializedAt` is set (Phase 5.3).

## Steps

1. **Confirm identity** — `GET /api/agents/me`. Verify `canCreateAgents` and org context.

2. **Assess org** — Review Delivery DNA, integration status, open releases, and pending approvals.

3. **Decide minimal roster** — Start small. Example:
   - If releases exist: propose **QA Intelligence** and **Governance** specialists.
   - Defer DevOps until observability (Prometheus/Grafana) is connected.

4. **Draft hire payloads** — For each proposed agent, write an `AGENTS.md` with:
   - Role and responsibilities
   - What to recommend vs escalate
   - Required skills (`aidos`, domain skills as needed)

5. **Submit hires** — `POST /api/agents/hire` per agent with `instructionsBundle.files["AGENTS.md"]`.

6. **Summarize** — Post an ops summary via Activity conventions. Mark initialization complete via `POST /api/agents/me/initialization/complete` when the first hire is approved or the team plan is submitted.

## Constraints

- Human approval required for every `AGENT_HIRE`.
- Do not over-hire — prefer 1–2 specialists initially.
- All mutations include `X-Run-Id` from the current heartbeat run.
