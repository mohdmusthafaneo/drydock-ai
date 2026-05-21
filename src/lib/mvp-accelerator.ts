import type { DeliveryDNA, Organization, OrganizationProfile } from "@/generated/prisma/client";

export type AcceleratorInput = {
  title: string;
  idea: string;
  targetUser?: string;
  problemStatement?: string;
};

export type AcceleratorFeature = {
  id: string;
  name: string;
  description: string;
  priority: "P0" | "P1" | "P2";
  effort: "S" | "M" | "L";
};

export type JiraEpic = {
  key: string;
  title: string;
  description: string;
  stories: string[];
};

export type RoadmapPhase = {
  phase: string;
  duration: string;
  goals: string[];
};

export type GeneratedAccelerator = {
  prdMarkdown: string;
  architectureMarkdown: string;
  features: AcceleratorFeature[];
  jiraEpics: JiraEpic[];
  qaPlanMarkdown: string;
  deploymentPlanMarkdown: string;
  roadmap: RoadmapPhase[];
};

type Context = {
  org: Organization;
  profile: OrganizationProfile | null;
  dna: DeliveryDNA | null;
  input: AcceleratorInput;
};

export function generateMvpAccelerator(ctx: Context): GeneratedAccelerator {
  const { org, profile, dna, input } = ctx;
  const workflow = dna?.workflowMode ?? "lean-mvp";
  const teamSize = profile?.teamSize ?? "11-50";
  const deploy = profile?.deploymentStrategy ?? "continuous";

  const prdMarkdown = buildPrd(input, org.name, workflow, teamSize);
  const architectureMarkdown = buildArchitecture(input, dna, deploy);
  const features = buildFeatures(input);
  const jiraEpics = buildJiraEpics(input, features);
  const qaPlanMarkdown = buildQaPlan(input, features, dna);
  const deploymentPlanMarkdown = buildDeploymentPlan(input, deploy, dna);
  const roadmap = buildRoadmap(features);

  return {
    prdMarkdown,
    architectureMarkdown,
    features,
    jiraEpics,
    qaPlanMarkdown,
    deploymentPlanMarkdown,
    roadmap,
  };
}

function buildPrd(
  input: AcceleratorInput,
  orgName: string,
  workflow: string,
  teamSize: string,
): string {
  return `# PRD: ${input.title}

## 1. Overview
**Organization:** ${orgName}  
**Workflow mode:** ${workflow} · **Team size:** ${teamSize}

### Vision
${input.idea}

### Problem
${input.problemStatement || "Teams need faster, governed path from idea to shippable MVP without losing quality or compliance."}

### Target users
${input.targetUser || "Product owners, engineering leads, and delivery managers in innovation teams."}

## 2. Goals & success metrics
| Goal | Metric | Target (90 days) |
|------|--------|------------------|
| Time to first release | Idea → production | ≤ 6 weeks |
| Scope clarity | Features with acceptance criteria | 100% P0 features |
| Quality gate | Critical defects in prod | 0 |

## 3. Scope
### In scope (MVP)
- Core user journey for the primary persona
- Authentication and org tenancy
- Admin configuration minimum viable set
- Observability hooks for release health

### Out of scope (v1)
- Advanced analytics, multi-region, enterprise SSO (Phase 2)
- Full automation without human approval

## 4. User stories (summary)
1. As a user, I can sign up and access my workspace so that I can start using the product.
2. As an admin, I can configure org settings so that the team operates under our delivery DNA.
3. As a delivery lead, I can track MVP progress so that we hit our launch date.

## 5. Non-functional requirements
- **Security:** RBAC, audit logs on sensitive actions
- **Performance:** p95 API < 500ms for core flows
- **Compliance:** Align with org governance level from Delivery DNA

## 6. Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Scope creep | Strict P0/P1 tagging; weekly scope review |
| Integration delay | Stub integrations first; OAuth in sprint 2 |

## 7. Approval
This PRD requires human approval in AIDOS before engineering execution begins.
`;
}

function buildArchitecture(
  input: AcceleratorInput,
  dna: DeliveryDNA | null,
  deploy: string,
): string {
  return `# Architecture: ${input.title}

## Principles
- **Human-governed AI:** recommendations and artifacts require approval (${dna?.autonomyMode ?? "RECOMMEND"} mode)
- **Modular monolith** for MVP speed; extract services when scale demands
- **Integration-first:** Jira + GitHub as system of record for delivery artifacts

## System context
\`\`\`
[User] → [Next.js App] → [API Routes] → [Prisma / SQLite]
                ↓
         [GitHub] [Jira] (read/sync)
\`\`\`

## Core components
| Layer | Technology | Responsibility |
|-------|------------|----------------|
| UI | Next.js 16, React 19, Tailwind | Accelerator wizard, PRD viewer, approvals |
| API | Next.js Route Handlers | Auth, accelerator generate, governance |
| Data | Prisma + SQLite (→ Postgres) | Orgs, projects, artifacts, audit |
| AI | Rule engine + optional LLM BYOK | PRD, architecture, epic breakdown |

## Data model (MVP slice)
- \`AcceleratorProject\` — idea, artifacts, step, approval status
- \`DeliveryDNA\` — governs autonomy and approval depth
- \`Approval\` / \`AuditLog\` — enterprise trust

## Deployment strategy
- **Strategy:** ${deploy}
- **Environments:** dev → staging → production with manual approval gate
- **CI:** build, lint, unit tests on PR; E2E on main

## Security
- JWT session, org-scoped queries, no cross-tenant data access
`;
}

function buildFeatures(input: AcceleratorInput): AcceleratorFeature[] {
  return [
    {
      id: "F1",
      name: "Idea intake & project workspace",
      description: `Capture and refine: ${input.title}`,
      priority: "P0",
      effort: "S",
    },
    {
      id: "F2",
      name: "AI artifact generation",
      description: "PRD, architecture, features, Jira epics, QA and deploy plans",
      priority: "P0",
      effort: "M",
    },
    {
      id: "F3",
      name: "Human approval workflow",
      description: "Approve or modify artifacts before downstream execution",
      priority: "P0",
      effort: "M",
    },
    {
      id: "F4",
      name: "Jira epic export",
      description: "Structured epics and stories ready for import",
      priority: "P0",
      effort: "S",
    },
    {
      id: "F5",
      name: "MVP roadmap view",
      description: "Phased timeline with goals per sprint",
      priority: "P1",
      effort: "S",
    },
    {
      id: "F6",
      name: "GitHub repo bootstrap",
      description: "Link generated architecture to repository scaffold",
      priority: "P1",
      effort: "M",
    },
  ];
}

function buildJiraEpics(
  input: AcceleratorInput,
  features: AcceleratorFeature[],
): JiraEpic[] {
  const p0 = features.filter((f) => f.priority === "P0");
  return [
    {
      key: "AIDOS-1",
      title: `[MVP] ${input.title} — Foundation`,
      description: "Auth, org model, accelerator project CRUD",
      stories: [
        "As a user I can create an accelerator project from an idea",
        "As a user I can view generated PRD and architecture",
      ],
    },
    {
      key: "AIDOS-2",
      title: `[MVP] ${input.title} — AI artifacts`,
      description: "Generation pipeline for PRD through deployment plan",
      stories: p0.slice(1, 4).map((f) => `Implement ${f.name}: ${f.description}`),
    },
    {
      key: "AIDOS-3",
      title: `[MVP] ${input.title} — Governance`,
      description: "Approval gate before marking accelerator complete",
      stories: [
        "As a delivery lead I can approve the accelerator package",
        "As compliance I can view audit trail for artifact approval",
      ],
    },
  ];
}

function buildQaPlan(
  input: AcceleratorInput,
  features: AcceleratorFeature[],
  dna: DeliveryDNA | null,
): string {
  return `# QA Plan: ${input.title}

## Test strategy
Governance score: ${dna?.governanceScore ?? "N/A"}/100 — depth of testing scales with org maturity.

## Test levels
| Level | Scope | Owner |
|-------|-------|-------|
| Unit | Generation engine, validators | Engineering |
| Integration | API routes, Prisma | Engineering |
| E2E | Idea → generate → approve flow | QA / Eng |
| UAT | Primary persona journeys | Product |

## P0 coverage
${features
  .filter((f) => f.priority === "P0")
  .map((f) => `- **${f.id}** ${f.name}`)
  .join("\n")}

## Release readiness criteria
- [ ] All P0 features pass E2E
- [ ] No critical/high open defects
- [ ] Human approval recorded in AIDOS
- [ ] Rollback plan documented
`;
}

function buildDeploymentPlan(
  input: AcceleratorInput,
  deploy: string,
  dna: DeliveryDNA | null,
): string {
  return `# Deployment Plan: ${input.title}

## Strategy
${deploy === "continuous" ? "Continuous delivery to staging; production requires approval." : "Scheduled releases with explicit approval gates."}

## Environments
1. **Development** — local / preview branches
2. **Staging** — integration validation
3. **Production** — customer-facing (approval level ${dna?.approvalLevel ?? 2})

## Rollout steps
1. Deploy to staging → smoke tests
2. Delivery manager approval in AIDOS
3. Production deploy (blue/green or rolling)
4. Monitor error rate & latency 24h

## Rollback
- Revert last deployment via CI
- Feature flags off for new accelerator UI if needed
`;
}

function buildRoadmap(features: AcceleratorFeature[]): RoadmapPhase[] {
  return [
    {
      phase: "Sprint 1 — Foundation",
      duration: "2 weeks",
      goals: features.filter((f) => f.id === "F1" || f.id === "F2").map((f) => f.name),
    },
    {
      phase: "Sprint 2 — Governance & Jira",
      duration: "2 weeks",
      goals: features.filter((f) => f.id === "F3" || f.id === "F4").map((f) => f.name),
    },
    {
      phase: "Sprint 3 — Polish & launch",
      duration: "2 weeks",
      goals: features.filter((f) => f.priority === "P1").map((f) => f.name),
    },
  ];
}
