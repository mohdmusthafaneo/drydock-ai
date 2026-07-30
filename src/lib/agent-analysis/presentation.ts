import { formatDistanceToNow } from "@/lib/format-date";
import type { BriefingClaimVerdict, BriefingHighlight } from "@/lib/executive-briefing/types";
import { buildDeploymentHealthSummary } from "@/lib/governance/presentation";
import { buildAgentAnalysisClaims } from "@/lib/agent-analysis/claims";
import {
  fileBasename,
  humanizeRevspec,
  humanizeSignalLabel,
  sanitizeFindingCopy,
} from "@/lib/agent-analysis/format";
import type {
  AgentDecision,
  AgentPageView,
  ClusteredFinding,
  LatestDevOpsRunSummary,
  LatestGovernanceRunSummary,
  LatestProductivityRunSummary,
  LatestQaRunSummary,
  ShareSegment,
} from "@/lib/agent-analysis/types";

export {
  fileBasename,
  humanizeRevspec,
  humanizeSignalLabel,
  sanitizeFindingCopy,
} from "@/lib/agent-analysis/format";

export type DevOpsDeploymentInput = {
  degradedDeployments: number;
  rollbackPending: number;
  deploymentEventCount: number;
};

export type DevOpsPageView = AgentPageView & {
  clusteredFindings: ClusteredFinding[];
  severitySegments: ShareSegment[];
};

export type CodeHealthPageView = AgentPageView & {
  topHotspots: Array<{
    basename: string;
    filePath: string;
    score: number | null;
    hasTestFile: boolean | null;
    maxCcn: number | null;
  }>;
  riskDrivers: Array<{ label: string; contribution: number | null }>;
  cleanupReadyCount: number;
  agentNotes: string | null;
};

export type ProductivityPageView = AgentPageView & {
  contributorSegments: ShareSegment[];
  commitTypeSegments: ShareSegment[];
  weeklyVolume: Array<{ isoWeek: string; commits: number }>;
  strongestSignals: string[];
  weakestSignals: string[];
};

const VERDICT_RANK: Record<BriefingClaimVerdict, number> = {
  good: 0,
  neutral: 1,
  attention: 2,
  risk: 3,
};

function worseVerdict(a: BriefingClaimVerdict, b: BriefingClaimVerdict): BriefingClaimVerdict {
  return VERDICT_RANK[a] >= VERDICT_RANK[b] ? a : b;
}

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function verifiedAgo(iso: string): string {
  return `verified ${formatDistanceToNow(new Date(iso))}`;
}

export function clusterFindingsByCheck(
  findings: LatestDevOpsRunSummary["topFindings"],
): ClusteredFinding[] {
  const map = new Map<string, ClusteredFinding>();
  for (const f of findings) {
    const key = f.checkId || f.title;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (f.resourceRef && existing.resourceRefs.length < 5) {
        existing.resourceRefs.push(f.resourceRef);
      }
      continue;
    }
    map.set(key, {
      checkId: f.checkId,
      title: sanitizeFindingCopy(f.title),
      severity: f.severity,
      count: 1,
      recommendation: sanitizeFindingCopy(f.recommendation),
      description: sanitizeFindingCopy(f.description),
      resourceRefs: f.resourceRef ? [f.resourceRef] : [],
    });
  }

  const severityRank: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
    INFO: 4,
  };

  return [...map.values()].sort((a, b) => {
    const sev = (severityRank[a.severity] ?? 5) - (severityRank[b.severity] ?? 5);
    if (sev !== 0) return sev;
    return b.count - a.count;
  });
}

function severitySegments(run: LatestDevOpsRunSummary): ShareSegment[] {
  const total = run.bySeverity.reduce((n, s) => n + s.count, 0);
  return run.bySeverity
    .filter((s) => s.count > 0)
    .map((s) => ({
      id: s.severity,
      label: capitalizeFirst(s.severity.toLowerCase()),
      count: s.count,
      sharePct: total > 0 ? Math.round((s.count / total) * 100) : 0,
      tone:
        s.severity === "CRITICAL"
          ? ("risk" as const)
          : s.severity === "HIGH"
            ? ("attention" as const)
            : ("neutral" as const),
    }));
}

function emptyView(scope: string, headline: string, subcopy: string): AgentPageView {
  return {
    hero: {
      verdict: "neutral",
      verdictLabel: "Awaiting data",
      headline,
      subcopy,
    },
    highlights: [],
    decisions: [
      {
        id: "configure",
        audience: "engineering",
        title: "Run the next agent refresh",
        detail: "Connect the required integration, then use Refresh all agents.",
        href: "/integrations",
        ctaLabel: "Open integrations",
        tone: "neutral",
      },
    ],
    scope,
  };
}

export function buildQaPageView(run: LatestQaRunSummary | null): AgentPageView {
  if (!run) {
    return emptyView(
      "QA board health",
      "No QA scan yet",
      "Connect Jira projects and refresh agents to see blocked work and open bugs.",
    );
  }

  const claim = buildAgentAnalysisClaims({
    qa: run,
    devops: null,
    governance: null,
    productivity: null,
    freshness: [],
  })[0];

  const projects =
    run.projectKeys.length > 0 ? run.projectKeys.join(", ") : "tracked projects";
  const blockedShare =
    run.open > 0 ? Math.round((run.blocked / run.open) * 100) : run.blocked > 0 ? 100 : 0;

  let headline: string;
  let subcopy: string;
  if (run.blocked > 0) {
    headline = `${run.blocked.toLocaleString()} blocked issue${run.blocked === 1 ? "" : "s"} holding release confidence`;
    subcopy = `${run.openBugs.toLocaleString()} open bugs across ${projects}. Clear blockers before the next ship window.`;
  } else if (run.openBugs > 50) {
    headline = `${run.openBugs.toLocaleString()} open bugs need triage`;
    subcopy = `${run.open.toLocaleString()} open issues across ${projects} — elevate ownership before release.`;
  } else if (run.openBugs > 0) {
    headline = `${run.openBugs.toLocaleString()} open bug${run.openBugs === 1 ? "" : "s"} on the board`;
    subcopy = `${run.open.toLocaleString()} open issues across ${projects}.`;
  } else {
    headline = "QA board is clear";
    subcopy = `No open bugs in the latest scan across ${projects}.`;
  }

  const highlights: BriefingHighlight[] = [
    {
      id: "blocked",
      label: "Blocked",
      value: String(run.blocked),
      subtext: run.open > 0 ? `${blockedShare}% of open work` : undefined,
      tone: run.blocked > 0 ? "risk" : "good",
    },
    {
      id: "open-bugs",
      label: "Open bugs",
      value: String(run.openBugs),
      tone: run.openBugs > 50 ? "attention" : run.openBugs > 0 ? "attention" : "good",
    },
    {
      id: "open",
      label: "Open issues",
      value: String(run.open),
      tone: "neutral",
    },
    {
      id: "projects",
      label: "Projects in scope",
      value: String(Math.max(run.projectKeys.length, 1)),
      subtext: projects,
      tone: "neutral",
    },
  ];

  const decisions: AgentDecision[] = [];
  if (run.blocked > 0) {
    decisions.push({
      id: "qa-blocked",
      audience: "leadership",
      title: "Unblock release-critical work",
      detail: `${run.blocked} blocked issue${run.blocked === 1 ? "" : "s"} are in the evidence set — ask engineering for an owner and ETA.`,
      href: "/recommendations",
      ctaLabel: "Review recommendations",
      tone: "risk",
    });
  }
  if (run.openBugs > 0) {
    decisions.push({
      id: "qa-bugs",
      audience: "engineering",
      title: "Triage open bugs",
      detail: `${run.openBugs} open bug${run.openBugs === 1 ? "" : "s"} in the latest sample — prioritize severity and assignees.`,
      href: "/recommendations",
      ctaLabel: "Open ops queue",
      tone: run.openBugs > 50 ? "attention" : "attention",
    });
  }
  if (decisions.length === 0) {
    decisions.push({
      id: "qa-healthy",
      audience: "engineering",
      title: "Keep the board healthy",
      detail: "No blockers or open bugs in the latest scan. Re-check after the next refresh.",
      tone: "good",
    });
  }

  return {
    hero: {
      verdict: claim?.verdict ?? "neutral",
      verdictLabel: claim?.verdictLabel ?? "QA",
      headline,
      subcopy,
    },
    highlights: highlights.slice(0, 4),
    decisions,
    scope: `${projects} · ${verifiedAgo(run.analyzedAt)}`,
  };
}

export function buildDevOpsPageView(
  run: LatestDevOpsRunSummary | null,
  deployment: DevOpsDeploymentInput,
): DevOpsPageView {
  const deployHealth = buildDeploymentHealthSummary({
    stats: {
      degradedDeployments: deployment.degradedDeployments,
      rollbackPending: deployment.rollbackPending,
    },
    deploymentEvents: Array.from({ length: deployment.deploymentEventCount }, (_, i) => ({
      id: `d${i}`,
    })),
  } as Parameters<typeof buildDeploymentHealthSummary>[0]);

  if (!run) {
    const deployActive =
      deployment.rollbackPending > 0 || deployment.degradedDeployments > 0;
    const base = emptyView(
      "Cloud hygiene",
      deployActive ? deployHealth.headline : "No cloud scan yet",
      deployActive
        ? deployHealth.subcopy
        : "Connect AWS and refresh agents for account hygiene. Deployment health appears when releases ship.",
    );
    return {
      ...base,
      hero: {
        verdict: worseVerdict(base.hero.verdict, deployHealth.verdict),
        verdictLabel: deployActive ? deployHealth.verdictLabel : base.hero.verdictLabel,
        headline: deployActive ? deployHealth.headline : base.hero.headline,
        subcopy: base.hero.subcopy,
      },
      clusteredFindings: [],
      severitySegments: [],
    };
  }

  const claim = buildAgentAnalysisClaims({
    qa: null,
    devops: run,
    governance: null,
    productivity: null,
    freshness: [],
  })[0];

  const critical = run.bySeverity.find((s) => s.severity === "CRITICAL")?.count ?? 0;
  const high = run.bySeverity.find((s) => s.severity === "HIGH")?.count ?? 0;
  const clustered = clusterFindingsByCheck(run.topFindings);
  const segments = severitySegments(run);

  const cloudVerdict = (claim?.verdict ?? "neutral") as BriefingClaimVerdict;
  const mergedVerdict = worseVerdict(cloudVerdict, deployHealth.verdict);

  let headline: string;
  let subcopy: string;
  let verdictLabel: string;

  const deployLeads =
    deployment.deploymentEventCount > 0 &&
    VERDICT_RANK[deployHealth.verdict] >= VERDICT_RANK[cloudVerdict];

  if (deployment.rollbackPending > 0 && critical > 0) {
    headline = `${deployment.rollbackPending} rollback${deployment.rollbackPending === 1 ? "" : "s"} pending · ${critical} critical cloud finding${critical === 1 ? "" : "s"}`;
    subcopy = `${deployHealth.subcopy} Account scan also found ${run.findingsCount} hygiene issues.`;
    verdictLabel = "Action needed";
  } else if (deployLeads) {
    headline = deployHealth.headline;
    subcopy =
      critical > 0 || high > 0
        ? `${deployHealth.subcopy} Cloud scan: ${critical} critical · ${high} high.`
        : run.findingsCount > 0
          ? `${deployHealth.subcopy} Latest AWS scan reported ${run.findingsCount} finding${run.findingsCount === 1 ? "" : "s"}.`
          : `${deployHealth.subcopy} Latest AWS scan reported no hygiene findings.`;
    verdictLabel = deployHealth.verdictLabel;
  } else if (critical > 0) {
    headline = `${critical} critical cloud finding${critical === 1 ? "" : "s"} need remediation`;
    subcopy = `${run.findingsCount} hygiene findings across account ${run.accountId} · ${run.resourcesCount} resources inventoried.`;
    verdictLabel = claim?.verdictLabel ?? `${critical} critical`;
  } else if (high > 0) {
    headline = `${high} high-severity finding${high === 1 ? "" : "s"} to review`;
    subcopy = `${run.findingsCount} findings · ${run.resourcesCount} resources inventoried.`;
    verdictLabel = claim?.verdictLabel ?? `${high} high`;
  } else if (run.findingsCount > 0) {
    headline = `${run.findingsCount} cloud finding${run.findingsCount === 1 ? "" : "s"} to review`;
    subcopy = `Non-critical hygiene items on account ${run.accountId}.`;
    verdictLabel = claim?.verdictLabel ?? "Findings";
  } else {
    headline = "Cloud hygiene looks clean";
    subcopy = "Latest AWS account scan reported no hygiene findings.";
    verdictLabel = claim?.verdictLabel ?? "Clean";
  }

  const highlights: BriefingHighlight[] = [
    {
      id: "critical",
      label: "Critical findings",
      value: String(critical),
      tone: critical > 0 ? "risk" : "good",
    },
    {
      id: "findings",
      label: "Total findings",
      value: String(run.findingsCount),
      tone: run.findingsCount > 0 ? "attention" : "good",
    },
    {
      id: "degraded",
      label: "Degraded deploys",
      value: String(deployment.degradedDeployments),
      tone: deployment.degradedDeployments > 0 ? "attention" : "good",
    },
    {
      id: "rollback",
      label: "Rollback recommended",
      value: String(deployment.rollbackPending),
      tone: deployment.rollbackPending > 0 ? "risk" : "good",
      href: deployment.rollbackPending > 0 ? "/approvals" : undefined,
    },
  ];

  const decisions: AgentDecision[] = [];
  if (deployment.rollbackPending > 0) {
    decisions.push({
      id: "devops-rollback",
      audience: "leadership",
      title: "Approve or reject rollbacks",
      detail: `${deployment.rollbackPending} deployment${deployment.rollbackPending === 1 ? "" : "s"} may need rollback — human sign-off required.`,
      href: "/approvals",
      ctaLabel: "Open approvals",
      tone: "risk",
    });
  }
  if (critical > 0) {
    const top = clustered[0];
    decisions.push({
      id: "devops-critical",
      audience: "engineering",
      title: top
        ? `${top.title}${top.count > 1 ? ` (${top.count})` : ""}`
        : "Remediate critical cloud findings",
      detail: top?.recommendation ?? "Review critical findings in recommendations.",
      href: "/recommendations",
      ctaLabel: "Open recommendations",
      tone: "risk",
    });
  } else if (high > 0) {
    decisions.push({
      id: "devops-high",
      audience: "engineering",
      title: "Review high-severity findings",
      detail: `${high} high finding${high === 1 ? "" : "s"} from the latest account scan.`,
      href: "/recommendations",
      ctaLabel: "Open recommendations",
      tone: "attention",
    });
  }
  if (decisions.length === 0) {
    decisions.push({
      id: "devops-ok",
      audience: "engineering",
      title: "Monitor cloud hygiene",
      detail: "No critical findings or rollbacks. Re-check after the next scheduled scan.",
      href: "/observability",
      ctaLabel: "Observability",
      tone: "good",
    });
  }

  return {
    hero: {
      verdict: mergedVerdict,
      verdictLabel,
      headline,
      subcopy,
    },
    highlights: highlights.slice(0, 4),
    decisions,
    scope: `Account ${run.accountId}${run.regionsCount != null ? ` · ${run.regionsCount} regions` : ""} · ${verifiedAgo(run.analyzedAt)}`,
    clusteredFindings: clustered.slice(0, 6),
    severitySegments: segments,
  };
}

export function buildCodeHealthPageView(
  run: LatestGovernanceRunSummary | null,
): CodeHealthPageView {
  if (!run) {
    const base = emptyView(
      "Code change risk",
      "No code-health scan yet",
      "Select GitHub repositories and refresh agents to score recent change risk.",
    );
    return {
      ...base,
      topHotspots: [],
      riskDrivers: [],
      cleanupReadyCount: 0,
      agentNotes: null,
    };
  }

  const claim = buildAgentAnalysisClaims({
    qa: null,
    devops: null,
    governance: run,
    productivity: null,
    freshness: [],
  })[0];

  const level = (run.riskLevel ?? "").toLowerCase();
  const priority = run.reviewPriority ? humanizeSignalLabel(run.reviewPriority) : null;
  const window = humanizeRevspec(run.revspec);

  let headline: string;
  if (level === "high" || level === "critical" || (run.riskScore != null && run.riskScore >= 7)) {
    headline = `High change risk on ${run.repositoryName}`;
  } else if (level === "medium" || (run.riskScore != null && run.riskScore >= 4)) {
    headline = `Elevated change risk on ${run.repositoryName}`;
  } else {
    headline = `Change risk is manageable on ${run.repositoryName}`;
  }

  const subcopyParts = [
    priority ? `Review priority: ${priority}` : null,
    run.riskScore != null ? `Score ${run.riskScore}` : null,
    run.worstFilePath ? `Hotspot: ${fileBasename(run.worstFilePath)}` : null,
  ].filter(Boolean);

  const riskDrivers = run.riskDrivers.map((d) => ({
    label: humanizeSignalLabel(d.label ?? `Driver ${d.rank}`),
    contribution: d.contribution,
  }));

  const topHotspots = run.worstFiles.slice(0, 3).map((f) => ({
    basename: fileBasename(f.filePath),
    filePath: f.filePath,
    score: f.score,
    hasTestFile: f.hasTestFile,
    maxCcn: f.maxCcn,
  }));

  const cleanupReadyCount = run.deadCode.filter((d) => d.cleanupReady).length;

  const highlights: BriefingHighlight[] = [
    {
      id: "score",
      label: "Risk score",
      value: run.riskScore != null ? String(run.riskScore) : "—",
      tone: claim?.verdict === "risk" ? "risk" : claim?.verdict === "attention" ? "attention" : "good",
    },
    {
      id: "priority",
      label: "Review priority",
      value: priority ?? "—",
      tone: "neutral",
    },
    {
      id: "hotspots",
      label: "Hotspot files",
      value: String(run.worstFiles.length),
      subtext: topHotspots[0] ? topHotspots[0].basename : undefined,
      tone: run.worstFiles.length > 0 ? "attention" : "good",
    },
    {
      id: "dead-code",
      label: "Cleanup-ready",
      value: String(cleanupReadyCount),
      subtext: run.deadCodeCount > 0 ? `${run.deadCodeCount} dead-code candidates` : undefined,
      tone: cleanupReadyCount > 0 ? "attention" : "good",
    },
  ];

  const decisions: AgentDecision[] = [];
  if (claim?.verdict === "risk" || claim?.verdict === "attention") {
    decisions.push({
      id: "code-review",
      audience: "engineering",
      title: topHotspots[0]
        ? `Review hotspot: ${topHotspots[0].basename}`
        : "Review elevated change risk",
      detail: riskDrivers[0]
        ? `Top driver: ${riskDrivers[0].label}. Assign a senior reviewer before merge.`
        : "Ask engineering to review the riskiest files in this window.",
      href: "/recommendations",
      ctaLabel: "Delegate review",
      tone: claim.verdict,
    });
  }
  if (cleanupReadyCount > 0) {
    decisions.push({
      id: "dead-code",
      audience: "engineering",
      title: `${cleanupReadyCount} cleanup-ready candidate${cleanupReadyCount === 1 ? "" : "s"}`,
      detail: "Dead-code findings the governance agent marked as safe to remove.",
      tone: "attention",
    });
  }
  if (decisions.length === 0) {
    decisions.push({
      id: "code-ok",
      audience: "engineering",
      title: "Keep change windows small",
      detail: "Risk is low on the latest window. Re-check after the next refresh.",
      tone: "good",
    });
  }

  return {
    hero: {
      verdict: claim?.verdict ?? "neutral",
      verdictLabel: claim?.verdictLabel ?? "Code risk",
      headline,
      subcopy: capitalizeFirst(subcopyParts.join(" · ") || "Latest governance agent scan."),
    },
    highlights: highlights.slice(0, 4),
    decisions,
    scope: `${run.repositoryName} · ${window} · ${verifiedAgo(run.analyzedAt)}`,
    topHotspots,
    riskDrivers,
    cleanupReadyCount,
    agentNotes: run.summary,
  };
}

export function buildProductivityPageView(
  run: LatestProductivityRunSummary | null,
): ProductivityPageView {
  if (!run) {
    const base = emptyView(
      "Delivery cadence",
      "No productivity scan yet",
      "Select GitHub repositories and refresh agents to see contributor mix and cadence.",
    );
    return {
      ...base,
      contributorSegments: [],
      commitTypeSegments: [],
      weeklyVolume: [],
      strongestSignals: [],
      weakestSignals: [],
    };
  }

  const claim = buildAgentAnalysisClaims({
    qa: null,
    devops: null,
    governance: null,
    productivity: run,
    freshness: [],
  })[0];

  const top = run.contributors[0];
  const strongestSignals = run.strongestSignals.map(humanizeSignalLabel);
  const weakestSignals = run.weakestSignals.map(humanizeSignalLabel);

  let headline: string;
  let subcopy: string;
  if (top && top.sharePct >= 50) {
    headline = `Bus factor risk: ${top.authorName} owns ${top.sharePct}% of commits`;
    subcopy = `${run.totalCommits?.toLocaleString() ?? "—"} commits analyzed on ${run.repositoryName} (${run.branch}). Spread ownership before the next push window.`;
  } else if (weakestSignals.length > 0) {
    headline = `Watch delivery signals on ${run.repositoryName}`;
    subcopy = top
      ? `${top.authorName} leads at ${top.sharePct}% · weakest: ${weakestSignals.slice(0, 2).join(", ")}.`
      : `Weakest signals: ${weakestSignals.slice(0, 2).join(", ")}.`;
  } else {
    headline = `Delivery cadence looks healthy on ${run.repositoryName}`;
    subcopy = top
      ? `${top.authorName} leads at ${top.sharePct}% of commits — within a healthy range.`
      : `${run.totalCommits?.toLocaleString() ?? "—"} commits analyzed on ${run.branch}.`;
  }

  const highlights: BriefingHighlight[] = [
    {
      id: "bus-factor",
      label: "Top contributor share",
      value: top ? `${top.sharePct}%` : "—",
      subtext: top?.authorName,
      tone: top && top.sharePct >= 50 ? "attention" : top && top.sharePct >= 40 ? "attention" : "good",
    },
    {
      id: "commits",
      label: "Commits analyzed",
      value: run.totalCommits != null ? String(run.totalCommits) : "—",
      tone: "neutral",
    },
    {
      id: "files",
      label: "Files touched",
      value: run.filesTouched != null ? String(run.filesTouched) : "—",
      tone: "neutral",
    },
    {
      id: "prs",
      label: "PRs merged",
      value: run.prsMerged != null ? String(run.prsMerged) : "—",
      tone: "neutral",
    },
  ];

  const contributorSegments: ShareSegment[] = run.contributors.map((c) => ({
    id: c.authorName,
    label: c.authorName,
    count: c.commits,
    sharePct: c.sharePct,
    tone: c.sharePct >= 50 ? "attention" : "neutral",
  }));

  const commitTypeSegments: ShareSegment[] = run.commitTypes.map((t) => ({
    id: t.commitType,
    label: humanizeSignalLabel(t.commitType),
    count: t.count,
    sharePct: t.sharePct,
    tone: "neutral",
  }));

  const decisions: AgentDecision[] = [];
  if (top && top.sharePct >= 50) {
    decisions.push({
      id: "bus-factor",
      audience: "leadership",
      title: "Address bus-factor concentration",
      detail: `${top.authorName} owns ${top.sharePct}% of recent commits — ask the engineering lead for a pairing or rotation plan.`,
      tone: "attention",
    });
  }
  if (weakestSignals.length > 0) {
    decisions.push({
      id: "weak-signals",
      audience: "engineering",
      title: "Improve weak delivery signals",
      detail: weakestSignals.slice(0, 3).join(" · "),
      tone: "attention",
    });
  }
  if (decisions.length === 0) {
    decisions.push({
      id: "prod-ok",
      audience: "engineering",
      title: "Maintain balanced ownership",
      detail: strongestSignals[0]
        ? `Strongest signal: ${strongestSignals[0]}.`
        : "Cadence looks balanced on the latest window.",
      tone: "good",
    });
  }

  return {
    hero: {
      verdict: claim?.verdict ?? "neutral",
      verdictLabel: claim?.verdictLabel ?? "Cadence",
      headline,
      subcopy,
    },
    highlights: highlights.slice(0, 4),
    decisions,
    scope: `${run.repositoryName} · ${run.branch} · ${verifiedAgo(run.analyzedAt)}`,
    contributorSegments,
    commitTypeSegments,
    weeklyVolume: run.weeklyVolume.slice(-12),
    strongestSignals,
    weakestSignals,
  };
}
