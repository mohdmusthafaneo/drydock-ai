import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDecisions,
  buildTeamLinks,
} from "@/lib/executive-briefing/compose-executive-deck";
import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import type { AgentDecision } from "@/lib/agent-analysis/types";

function minimalBriefing(overrides?: Partial<ExecutiveBriefing>): ExecutiveBriefing {
  return {
    headline: [{ kind: "text", text: "Test." }],
    meta: "test",
    highlights: [],
    narrative: "Test.",
    wordCount: 1,
    health: {
      overall: 50,
      band: "caution",
      bandLabel: "Caution",
      dimensions: [],
      computedAt: new Date().toISOString(),
      dataGaps: [],
      visible: true,
    },
    claims: [],
    freshness: {
      asOf: new Date().toISOString(),
      stale: false,
      staleSources: [],
    },
    source: "deterministic",
    ...overrides,
  };
}

function minimalCtx(overrides?: {
  pendingApprovals?: number;
  rollbackPending?: number;
  openIncidents?: number;
}) {
  return {
    stats: {
      pendingApprovals: overrides?.pendingApprovals ?? 0,
      rollbackPending: overrides?.rollbackPending ?? 0,
      openIncidents: overrides?.openIncidents ?? 0,
      releaseReadiness: 70,
      degradedDeployments: 0,
      errorRate: null,
      p95Latency: null,
      connectedTools: 2,
      integrationsHealthy: 2,
    },
    approvals: [],
    releases: [],
    incidents: [],
    recommendations: [],
    integrations: [],
    dna: null,
    deploymentEvents: [],
  } as unknown as Parameters<typeof buildDecisions>[1];
}

describe("buildDecisions agent leadership merge", () => {
  it("merges agent leadership decisions without duplicating rollback", () => {
    const agentDecisions: AgentDecision[] = [
      {
        id: "qa-unblock",
        audience: "leadership",
        title: "Unblock release-critical work",
        detail: "30 blocked QA issues need attention.",
        href: "/qa",
        ctaLabel: "Review QA",
        tone: "risk",
      },
      {
        id: "devops-rollback",
        audience: "leadership",
        title: "Confirm rollback",
        detail: "A deployment may need rollback.",
        href: "/devops",
        ctaLabel: "Review",
        tone: "risk",
      },
      {
        id: "productivity-bus-factor",
        audience: "leadership",
        title: "Address bus-factor concentration",
        detail: "One contributor owns 51% of commits.",
        href: "/productivity",
        ctaLabel: "Review cadence",
        tone: "attention",
      },
      {
        id: "eng-only",
        audience: "engineering",
        title: "Fix hotspot",
        detail: "Should not appear.",
        href: "/code-health",
        tone: "attention",
      },
    ];

    const decisions = buildDecisions(
      minimalBriefing(),
      minimalCtx({ rollbackPending: 1 }),
      agentDecisions.filter((d) => d.audience === "leadership"),
    );

    assert.ok(decisions.some((d) => d.id === "rollback"));
    assert.ok(decisions.some((d) => d.id === "qa-unblock"));
    assert.ok(decisions.some((d) => d.id === "productivity-bus-factor"));
    assert.ok(!decisions.some((d) => d.id === "devops-rollback"));
    assert.ok(!decisions.some((d) => d.id === "eng-only"));

    const qa = decisions.find((d) => d.id === "qa-unblock")!;
    assert.equal(qa.urgency, "critical");
    assert.equal(qa.actionLabel, "Review QA");
  });
});

describe("buildTeamLinks agent pages", () => {
  it("adds agent pages for non-good verdicts and caps at six", () => {
    const briefing = minimalBriefing({
      claims: [
        {
          id: "qa-posture",
          headline: "QA posture",
          verdict: "risk",
          verdictLabel: "30 blocked",
          context: "Blocked issues need triage",
          href: "/qa",
        },
        {
          id: "cloud-hygiene",
          headline: "Cloud hygiene",
          verdict: "risk",
          verdictLabel: "35 critical",
          context: "Critical cloud findings",
          href: "/devops",
        },
        {
          id: "code-risk",
          headline: "Code change risk",
          verdict: "attention",
          verdictLabel: "Elevated",
          context: "Review hotspots",
          href: "/code-health",
        },
        {
          id: "productivity",
          headline: "Delivery cadence",
          verdict: "good",
          verdictLabel: "Healthy",
          context: "Balanced contributors",
          href: "/productivity",
        },
      ],
    });

    const links = buildTeamLinks(briefing, minimalCtx(), true, false, false);
    assert.ok(links.length <= 6);
    assert.ok(links.some((l) => l.id === "delivery"));
    assert.ok(links.some((l) => l.id === "qa"));
    assert.ok(links.some((l) => l.id === "devops"));
    assert.ok(links.some((l) => l.id === "code-health"));
    assert.ok(!links.some((l) => l.id === "productivity"));

    const saturated = buildTeamLinks(
      briefing,
      {
        ...minimalCtx(),
        releases: [{ id: "r1" }],
        stats: { ...minimalCtx().stats, openIncidents: 1 },
      } as ReturnType<typeof minimalCtx>,
      true,
      true,
      true,
    );
    assert.equal(saturated.length, 6);
  });
});
