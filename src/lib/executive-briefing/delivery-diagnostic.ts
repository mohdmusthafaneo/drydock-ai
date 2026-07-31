import type { DeliveryAnalysisSnapshot } from "@/lib/delivery-analysis/types";
import type { JiraDeliverySnapshot } from "@/lib/jira-meta";
import type { HeadlineSegment, HealthBand } from "@/lib/executive-briefing/types";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";

export type DeliveryDiagnosticFacts = {
  mode: "sprint" | "fixVersion" | "none";
  scopeLabel: string | null;
  pct: number | null;
  done: number | null;
  committed: number | null;
  blocked: number;
  overdue: number;
  unassigned: number;
  bugsInScope: number | null;
  bugsOverall: number | null;
  spillover: number | null;
  spilloverPrior: number | null;
  openWork: number | null;
  openWorkDelta: number | null;
  reopened: number | null;
  resolvedLast7d: number | null;
  /** True when crisis signals (blocked/overdue/unassigned) are all clear. */
  crisisClear: boolean;
  /** Shape issues independent of crisis: low completion, rising open work, heavy bugs, spillover. */
  shapeIssues: Array<
    "low_completion" | "rising_open_work" | "heavy_bugs" | "spillover" | "reopened"
  >;
};

function flattenHeadline(segments: HeadlineSegment[]): string {
  return segments.map((s) => s.text).join("");
}

function bandPhrase(band: HealthBand | null): string {
  switch (band) {
    case "strong":
      return "looking strong";
    case "steady":
      return "holding steady";
    case "caution":
      return "needs attention";
    case "at_risk":
      return "at risk";
    default:
      return "being established";
  }
}

/**
 * Pull sprint/board diagnostic counts from the delivery analysis snapshot plus
 * raw Jira project meta (unassigned + overall bugs are not on KPIs today).
 */
export function extractDeliveryDiagnosticFacts(input: {
  deliverySnapshot?: DeliveryAnalysisSnapshot | null;
  jiraSnapshot?: JiraDeliverySnapshot | null;
  mapping?: ToolchainMapping | null;
}): DeliveryDiagnosticFacts {
  const ds = input.deliverySnapshot;
  const tracking = input.mapping?.jira?.releaseTracking ?? "fixVersion";
  const sprint = ds?.sprints?.[0] ?? null;
  const kpis = ds?.kpis;

  const projects = input.jiraSnapshot?.projects ?? [];
  let unassigned = 0;
  let bugsOverall = 0;
  let bugsInSprint = 0;
  let spilloverFromMeta = 0;
  let committed = 0;
  let done = 0;

  for (const p of projects) {
    bugsOverall += p.bugsOpen ?? 0;
    const sprintMeta = p.activeSprint;
    if (sprintMeta) {
      unassigned += sprintMeta.unassignedCount ?? p.unassignedCount ?? 0;
      bugsInSprint += sprintMeta.bugsOpen ?? 0;
      spilloverFromMeta += sprintMeta.spilloverCount ?? p.spilloverCount ?? 0;
      committed += sprintMeta.committed ?? 0;
      done += sprintMeta.done ?? 0;
    } else {
      unassigned += p.unassignedCount ?? 0;
      spilloverFromMeta += p.spilloverCount ?? 0;
    }
  }

  const blocked = kpis?.blocked ?? 0;
  const overdue = kpis?.overdue ?? 0;
  const spillover = kpis?.spillover ?? (spilloverFromMeta > 0 ? spilloverFromMeta : null);
  const spilloverPrior =
    kpis?.spilloverDelta != null && spillover != null
      ? Math.max(0, spillover - kpis.spilloverDelta)
      : null;

  const bugsInScope =
    tracking === "sprint"
      ? bugsInSprint > 0
        ? bugsInSprint
        : (kpis?.bugsOpen ?? null)
      : (kpis?.bugsOpen ?? (bugsOverall > 0 ? bugsOverall : null));

  const pct =
    sprint?.pct ??
    kpis?.sprintCompletionPct ??
    (committed > 0 ? Math.round((done / committed) * 100) : null);

  const openWork = kpis?.openWork ?? null;
  const openWorkDelta = kpis?.openWorkDelta ?? null;
  const reopened = kpis?.reopened ?? null;

  const mode: DeliveryDiagnosticFacts["mode"] =
    tracking === "sprint" && (sprint || kpis?.scopeMode === "sprint")
      ? "sprint"
      : ds
        ? "fixVersion"
        : "none";

  const shapeIssues: DeliveryDiagnosticFacts["shapeIssues"] = [];
  if (pct != null && pct < 50) shapeIssues.push("low_completion");
  if (openWorkDelta != null && openWorkDelta > 0) shapeIssues.push("rising_open_work");
  if (
    (bugsInScope != null && bugsInScope >= 8) ||
    (bugsOverall != null && bugsOverall >= 50)
  ) {
    shapeIssues.push("heavy_bugs");
  }
  if (spillover != null && spillover >= 5) shapeIssues.push("spillover");
  if (reopened != null && reopened >= 3) shapeIssues.push("reopened");

  return {
    mode,
    scopeLabel: sprint?.name ?? kpis?.scopeLabel ?? null,
    pct,
    done: sprint?.done ?? (done > 0 ? done : null),
    committed: sprint?.committed ?? (committed > 0 ? committed : null),
    blocked,
    overdue,
    unassigned,
    bugsInScope,
    bugsOverall: bugsOverall > 0 ? bugsOverall : null,
    spillover,
    spilloverPrior,
    openWork,
    openWorkDelta,
    reopened,
    resolvedLast7d: kpis?.resolvedLast7d ?? null,
    crisisClear: blocked === 0 && overdue === 0 && unassigned === 0,
    shapeIssues,
  };
}

function crisisClause(facts: DeliveryDiagnosticFacts): string {
  if (facts.crisisClear) {
    return "not in crisis (nothing blocked, overdue, or unassigned)";
  }
  const parts: string[] = [];
  if (facts.blocked > 0) {
    parts.push(`${facts.blocked} blocked`);
  }
  if (facts.overdue > 0) {
    parts.push(`${facts.overdue} overdue`);
  }
  if (facts.unassigned > 0) {
    parts.push(`${facts.unassigned} unassigned`);
  }
  return `in crisis (${parts.join(", ")})`;
}

/** Keep shape to the top two issues so L1 stays scannable. */
function shapeClause(facts: DeliveryDiagnosticFacts): string | null {
  if (facts.shapeIssues.length === 0) return null;

  const parts: string[] = [];
  for (const issue of facts.shapeIssues) {
    if (parts.length >= 2) break;
    if (issue === "low_completion" && facts.pct != null) {
      parts.push("too little getting done");
    } else if (issue === "rising_open_work" && facts.openWorkDelta != null) {
      parts.push(`too much new work pulled in (+${facts.openWorkDelta})`);
    } else if (issue === "heavy_bugs") {
      if (facts.bugsInScope != null && facts.bugsOverall != null) {
        parts.push(
          `heavy bug load (${facts.bugsInScope} in ${facts.mode === "sprint" ? "sprint" : "scope"}, ${facts.bugsOverall} overall)`,
        );
      } else if (facts.bugsInScope != null) {
        parts.push(`heavy bug load (${facts.bugsInScope} in scope)`);
      } else if (facts.bugsOverall != null) {
        parts.push(`heavy bug load (${facts.bugsOverall} overall)`);
      }
    } else if (issue === "reopened" && facts.reopened != null && parts.length === 0) {
      parts.push(`${facts.reopened} reopened`);
    } else if (issue === "spillover" && facts.spillover != null && parts.length === 0) {
      parts.push(`${facts.spillover} spillover`);
    }
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} and ${parts[1]}`;
}

function trajectoryClause(facts: DeliveryDiagnosticFacts): string | null {
  if (facts.pct == null) return null;

  if (facts.pct < 60) {
    if (facts.spillover != null && facts.spillover >= 5) {
      if (facts.spilloverPrior != null && facts.spilloverPrior > 0) {
        return `If nothing changes, expect ~${facts.pct}% finish with spillover (${facts.spilloverPrior} last cycle → ${facts.spillover} now).`;
      }
      return `If nothing changes, expect ~${facts.pct}% finish with ${facts.spillover} items already spilling over.`;
    }
    return `If nothing changes, expect roughly ~${facts.pct}% completion and growing carryover.`;
  }

  if (facts.pct < 80) {
    return `At ~${facts.pct}% complete, remaining work still needs focus to avoid late spillover.`;
  }

  return null;
}

/**
 * Compact L1 diagnostic narrative (~2 sentences, ~45–70 words).
 * Falls back to the flattened headline when delivery data is thin.
 */
export function buildDiagnosticNarrative(input: {
  orgName: string;
  headline: HeadlineSegment[];
  healthBand: HealthBand | null;
  healthVisible: boolean;
  facts: DeliveryDiagnosticFacts;
  pendingApprovals?: number;
  openIncidents?: number;
  assessmentSummary?: string | null;
}): string {
  const { facts } = input;
  const headlineText = flattenHeadline(input.headline).trim();

  if (facts.mode === "none" || (!facts.scopeLabel && facts.pct == null && facts.openWork == null)) {
    const extras: string[] = [];
    if ((input.pendingApprovals ?? 0) > 0) {
      extras.push(
        `${input.pendingApprovals} approval${input.pendingApprovals === 1 ? "" : "s"} need a decision.`,
      );
    }
    if ((input.openIncidents ?? 0) > 0) {
      extras.push(
        `${input.openIncidents} open incident${input.openIncidents === 1 ? "" : "s"}.`,
      );
    }
    if (extras.length === 0) return headlineText;
    return `${headlineText} ${extras.join(" ")}`.trim();
  }

  const scope =
    facts.scopeLabel ??
    (facts.mode === "sprint" ? "the active sprint" : "the current release scope");
  const crisis = crisisClause(facts);
  const shape = shapeClause(facts);

  const lead =
    facts.mode === "sprint"
      ? `The sprint (${scope}) is ${crisis}`
      : `${input.orgName} on ${scope} is ${crisis}`;

  let body: string;
  if (shape && facts.crisisClear) {
    body = `${lead}, but the shape is bad: ${shape}.`;
  } else if (shape && !facts.crisisClear) {
    body = `${lead}. Shape is strained: ${shape}.`;
  } else if (facts.crisisClear) {
    const band =
      input.healthVisible && input.healthBand
        ? ` Delivery is ${bandPhrase(input.healthBand)}.`
        : "";
    body = `${lead}.${band}`;
  } else {
    body = `${lead}.`;
  }

  const parts = [body];
  const trajectory = trajectoryClause(facts);
  if (trajectory) parts.push(trajectory);

  // Prefer a single governance CTA over stacking approvals + incidents.
  if ((input.pendingApprovals ?? 0) > 0 && parts.length < 3) {
    parts.push(
      `${input.pendingApprovals} approval${input.pendingApprovals === 1 ? "" : "s"} need sign-off.`,
    );
  } else if ((input.openIncidents ?? 0) > 0 && parts.length < 3) {
    parts.push(
      `${input.openIncidents} open incident${input.openIncidents === 1 ? "" : "s"}.`,
    );
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}
