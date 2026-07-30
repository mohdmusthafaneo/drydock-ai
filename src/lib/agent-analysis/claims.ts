import type { BriefingClaim, BriefingClaimVerdict } from "@/lib/executive-briefing/types";
import type { LatestAgentAnalysisBundle } from "@/lib/agent-analysis/types";

function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildAgentAnalysisClaims(
  bundle: LatestAgentAnalysisBundle,
): BriefingClaim[] {
  const claims: BriefingClaim[] = [];

  if (bundle.qa) {
    const { openBugs, blocked, open } = bundle.qa;
    let verdict: BriefingClaimVerdict;
    let verdictLabel: string;
    let context: string;

    if (blocked > 0) {
      verdict = "risk";
      verdictLabel = `${blocked} blocked`;
      context = `${openBugs.toLocaleString()} open bugs · ${open.toLocaleString()} open issues`;
    } else if (openBugs > 50) {
      verdict = "attention";
      verdictLabel = "Elevated bugs";
      context = `${openBugs.toLocaleString()} open bugs across ${bundle.qa.projectKeys.join(", ") || "tracked projects"}`;
    } else if (openBugs > 0) {
      verdict = "attention";
      verdictLabel = "Bugs open";
      context = `${openBugs.toLocaleString()} open bugs · ${open.toLocaleString()} open issues`;
    } else {
      verdict = "good";
      verdictLabel = "Clear";
      context = "No open bugs in the latest QA scan";
    }

    claims.push({
      id: "qa-posture",
      headline: "QA posture",
      metric: String(blocked > 0 ? blocked : openBugs),
      metricLabel: blocked > 0 ? "Blocked issues" : "Open bugs",
      verdict,
      verdictLabel,
      context: capitalizeFirst(context),
      href: "/qa",
    });
  }

  if (bundle.devops) {
    const critical =
      bundle.devops.bySeverity.find((s) => s.severity === "CRITICAL")?.count ?? 0;
    const high =
      bundle.devops.bySeverity.find((s) => s.severity === "HIGH")?.count ?? 0;
    let verdict: BriefingClaimVerdict;
    let verdictLabel: string;
    let context: string;

    if (critical > 0) {
      verdict = "risk";
      verdictLabel = `${critical} critical`;
      context = `${bundle.devops.findingsCount} hygiene findings across account ${bundle.devops.accountId}`;
    } else if (high > 0) {
      verdict = "attention";
      verdictLabel = `${high} high`;
      context = `${bundle.devops.findingsCount} findings · ${bundle.devops.resourcesCount} resources inventoried`;
    } else if (bundle.devops.findingsCount > 0) {
      verdict = "attention";
      verdictLabel = "Findings";
      context = `${bundle.devops.findingsCount} non-critical findings to review`;
    } else {
      verdict = "good";
      verdictLabel = "Clean";
      context = "Latest AWS account scan reported no hygiene findings";
    }

    claims.push({
      id: "cloud-hygiene",
      headline: "Cloud hygiene",
      metric: String(critical > 0 ? critical : bundle.devops.findingsCount),
      metricLabel: critical > 0 ? "Critical findings" : "Findings",
      verdict,
      verdictLabel,
      context: capitalizeFirst(context),
      href: "/devops",
    });
  }

  if (bundle.governance) {
    const level = (bundle.governance.riskLevel ?? "").toLowerCase();
    const score = bundle.governance.riskScore;
    let verdict: BriefingClaimVerdict;
    let verdictLabel: string;

    if (level === "high" || level === "critical" || (score != null && score >= 7)) {
      verdict = "risk";
      verdictLabel = "High risk";
    } else if (level === "medium" || (score != null && score >= 4)) {
      verdict = "attention";
      verdictLabel = "Elevated";
    } else {
      verdict = "good";
      verdictLabel = "Low risk";
    }

    const contextParts = [
      bundle.governance.repositoryName,
      bundle.governance.revspec,
      bundle.governance.worstFilePath
        ? `worst file ${bundle.governance.worstFilePath}`
        : null,
    ].filter(Boolean);

    claims.push({
      id: "code-risk",
      headline: "Code change risk",
      metric: score != null ? String(score) : undefined,
      metricLabel: score != null ? "Risk score" : undefined,
      verdict,
      verdictLabel,
      context: capitalizeFirst(contextParts.join(" · ")),
      href: "/code-health",
    });
  }

  if (bundle.productivity) {
    const top = bundle.productivity.contributors[0];
    const busFactor =
      top && top.sharePct >= 50
        ? "attention"
        : top && top.sharePct >= 40
          ? "attention"
          : "good";
    const verdict: BriefingClaimVerdict =
      bundle.productivity.weakestSignals.length > 0 ? busFactor : "good";

    claims.push({
      id: "productivity",
      headline: "Delivery cadence",
      metric:
        bundle.productivity.totalCommits != null
          ? String(bundle.productivity.totalCommits)
          : undefined,
      metricLabel: "Commits analyzed",
      verdict,
      verdictLabel:
        top && top.sharePct >= 50
          ? "Bus factor"
          : bundle.productivity.weakestSignals.length > 0
            ? "Watch signals"
            : "Healthy",
      context: capitalizeFirst(
        top
          ? `${top.authorName} owns ${top.sharePct}% of commits on ${bundle.productivity.repositoryName}`
          : `Latest productivity scan for ${bundle.productivity.repositoryName}`,
      ),
      href: "/productivity",
    });
  }

  return claims;
}
