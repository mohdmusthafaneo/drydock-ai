# AIDOS — Product Overview

## What it is

AIDOS (AI Delivery Intelligence Platform) is a **governance and operational intelligence layer** for AI-native software delivery. It is not an AI coding assistant, copilot, or autonomous agent builder.

The core idea is **Governance-Aware Agentic Operational Intelligence**: enterprises need a way to govern, observe, and orchestrate AI-assisted delivery — not just generate more AI output.

AIDOS sits above existing tools (GitHub, Jira, Grafana, CI/CD, Kubernetes, etc.) and provides a unified, governed view of delivery operations. It integrates with the stack rather than replacing it.

**One-line description:** AIDOS governs, observes, and orchestrates enterprise AI operations.

---

## The problem it addresses

Organizations adopting AI for product and engineering work face challenges around:

- Trust and auditability of AI-generated work
- Governance and policy enforcement
- Operational visibility across delivery, QA, and deployment
- Release confidence and human oversight
- Managing many AI workflows without losing control

AIDOS is built for that layer — governance, observability, and operational intelligence — rather than raw code generation or workflow automation alone.

---

## How it works

AIDOS uses a **human-governed** model:

- AI **recommends**, correlates signals, and predicts risk
- Humans **approve**, supervise, and control outcomes

High-impact actions require explicit human approval. Nothing executes automatically without sign-off. Audit trails record who did what and when.

---

## Current capabilities (MVP)

### Organization discovery & Delivery DNA

A guided discovery wizard captures how an organization delivers software. AIDOS generates a **Delivery DNA** profile — maturity, governance posture, and delivery context — that informs recommendations and generated artifacts.

### MVP Delivery Accelerator

Turns a product idea into a governed, shippable MVP package:

**Idea → PRD → Architecture → Feature breakdown → Jira epics → QA plan → Deployment plan → Human approval**

Artifacts are generated, reviewable, and must be approved before handoff to engineering.

### Recommendations center

Explainable AI recommendations with confidence scores and rationale.

### Approval center

Central workflow to approve, reject, or modify AI-generated proposals. No automated execution without approval.

### Integrations

Connectors for GitHub (OAuth), Jira, Grafana, and Slack. External setup links allow admins to configure integrations without every user needing an AIDOS account.

### Multi-tenant workspace

Organization-scoped workspaces with authentication, role-based access, activity feeds, and audit logging.

---

## Target users

### Primary (current MVP focus)

- Startup founders and product leaders who need fast, structured planning from an idea
- Innovation teams and internal incubators validating new products
- Engineering leads who want Jira-ready epics, QA plans, and deployment plans — not unstructured AI output
- Heads of Product who need oversight without becoming a bottleneck

### Enterprise expansion (roadmap)

- Platform and DevOps teams needing operational visibility and release governance
- QA and release managers focused on readiness and regression intelligence
- Security and compliance teams requiring audit logs and human-in-the-loop controls
- CTOs and VP Engineering scaling AI-assisted delivery with governance built in

---

## Roadmap direction

AIDOS is expanding toward a full governance and operational intelligence platform:

- **Observability intelligence** — correlating delivery, QA, and deployment signals
- **QA intelligence** — regression analysis and release readiness scoring
- **Delivery governance** — policy, explainability, and controlled automation
- **Agentic orchestration** — governing AI workflows at scale
- **Executive dashboards** — maturity analytics and operational insights

The MVP Delivery Accelerator is the current entry point. Enterprise governance and observability capabilities are the planned expansion for the same customers.

---

## What AIDOS is not

- Not an AI coding IDE or code generation tool
- Not an autonomous agent platform that runs without human approval
- Not a replacement for GitHub, Jira, or observability tools — it sits above them

---

## Technology

Web application built with Next.js, React, TypeScript, and Tailwind CSS. Multi-tenant architecture with organization-scoped data isolation.
