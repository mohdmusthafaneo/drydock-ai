import { jqlQuoteLiteral } from "@/lib/jira-jql";
import type { ScheduleRiskEvidence } from "@/lib/delivery-analysis/types";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";
import type { OverviewDerivedPack } from "@/lib/store/mock/overview-derived";

/** Client-safe Jira search URL — do not import `@/lib/jira-issue-links` here (pulls Prisma/Redis). */
function buildJiraIssuesSearchUrl(siteUrl: string, jql: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/issues/?jql=${encodeURIComponent(jql)}`;
}

/** Jira "Team Name" custom-field values from the TPT export. */
const JIRA_TEAM_NAME: Record<string, string> = {
  AVENGERS: "Agile Avengers Team",
  APEX: "Apex Team",
  DARK: "Dark Side Team",
  MOBILE: "Mobile",
};

type DerivedScheduleRisk = {
  definition: string;
  total: number;
  byTeam: ReadonlyArray<{ key: string; name: string; count: number }>;
};

/**
 * Overview mock heuristic: open sprint work that is Highest/High or still To Do.
 * Mirrors spillover_count in the overview mock generators.
 */
export function buildMockScheduleRiskJql(input: {
  projectKey: string;
  sprintName: string;
  teamKey?: string | null;
}): string {
  const parts = [
    `project = ${jqlQuoteLiteral(input.projectKey)}`,
    `sprint = ${jqlQuoteLiteral(input.sprintName)}`,
    "statusCategory != Done",
    '(priority in (Highest, High) OR status = "To Do")',
  ];
  const teamName = input.teamKey ? JIRA_TEAM_NAME[input.teamKey] : undefined;
  if (teamName) {
    parts.push(`"Team Name" = ${jqlQuoteLiteral(teamName)}`);
  }
  return parts.join(" AND ");
}

function withJiraUrls(
  risk: DerivedScheduleRisk,
  projectKey: string,
  siteUrl: string | null | undefined,
  sprintName: string,
): ScheduleRiskEvidence {
  const href = (teamKey?: string) =>
    siteUrl
      ? buildJiraIssuesSearchUrl(
          siteUrl,
          buildMockScheduleRiskJql({
            projectKey,
            sprintName,
            teamKey,
          }),
        )
      : undefined;

  return {
    definition: risk.definition,
    total: risk.total,
    byTeam: risk.byTeam.map((t) => ({
      key: t.key,
      name: t.name,
      count: t.count,
      jiraUrl: href(t.key),
    })),
    jiraUrl: href(),
  };
}

/** Resolve spillover evidence for a mock Overview sprint/team leaf. */
export function resolveMockScheduleRiskFromDerived(
  derived: OverviewDerivedPack,
  sprintId: string | null,
  teamKey: string | null,
  options?: { siteUrl?: string | null },
): ScheduleRiskEvidence | undefined {
  const sid = sprintId ?? derived.defaultSprintId;
  const sprint =
    derived.sprints.find((s) => s.id === sid) ?? derived.sprints[0];
  const sprintName = sprint?.name ?? `Sprint ${sid}`;
  const siteUrl = options?.siteUrl ?? derived.jiraSiteUrl;

  if (teamKey) {
    const scoped = derived.scheduleRiskByTeamSprint[`${teamKey}:${sid}`] as
      | DerivedScheduleRisk
      | undefined;
    if (scoped) {
      return withJiraUrls(scoped, derived.projectKey, siteUrl, sprintName);
    }
  }

  const bySprint = derived.scheduleRiskBySprint[sid] as
    | DerivedScheduleRisk
    | undefined;
  return bySprint
    ? withJiraUrls(bySprint, derived.projectKey, siteUrl, sprintName)
    : undefined;
}

/** Resolve spillover evidence for the TPT mock Overview sprint/team leaf. */
export function resolveMockScheduleRisk(
  sprintId: string | null,
  teamKey: string | null,
  options?: { siteUrl?: string | null },
): ScheduleRiskEvidence | undefined {
  return resolveMockScheduleRiskFromDerived(
    TPT_OVERVIEW_DERIVED as unknown as OverviewDerivedPack,
    sprintId,
    teamKey,
    options,
  );
}
