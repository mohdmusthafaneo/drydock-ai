import {
  countIssuesByJql,
  fetchIssueSprintChangelog,
  listBoardSprints,
  type JiraSprintIssue,
} from "@/lib/jira-api";
import {
  buildCarryOverSpilloverJql,
  buildMultiSprintSpilloverJql,
  type JiraMappingSlice,
} from "@/lib/jira-jql";
import { isIssueDone } from "@/lib/jira-sprint-metrics";

export type SpilloverCountResult = {
  count: number;
  method: "carry_over" | "multi_sprint" | "changelog" | "issue_scan";
};

export { DEFAULT_QA_PIPELINE_STATUSES } from "@/lib/jira-sprint-metrics";

function sprintNamesFromChange(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function wasMovedFromPriorSprint(
  changes: Array<{ from: string | null; to: string | null }>,
  priorSprintName: string,
  targetSprintName: string,
): boolean {
  for (const c of changes) {
    const fromNames = sprintNamesFromChange(c.from);
    const toNames = sprintNamesFromChange(c.to);
    const inFrom = fromNames.some(
      (n) => n.includes(priorSprintName) || priorSprintName.includes(n),
    );
    const inTo = toNames.some(
      (n) => n.includes(targetSprintName) || targetSprintName.includes(n),
    );
    if (inFrom && inTo) return true;
  }
  return false;
}

/** Count open carry-over issues created before sprint start (from pre-fetched sprint issues). */
export function countCarryOverFromIssues(
  issues: JiraSprintIssue[],
  sprintStartDate: string | undefined,
  mapping: JiraMappingSlice,
): number {
  if (!sprintStartDate) return 0;
  const start = new Date(sprintStartDate);
  return issues.filter(
    (i) =>
      !isIssueDone(i.status, i.statusCategory, mapping) &&
      i.created &&
      new Date(i.created) < start,
  ).length;
}

/**
 * Changelog-based spillover: open issues in active sprint that were moved from
 * the immediately prior closed sprint. Capped to avoid rate limits during sync.
 */
export async function countChangelogPriorSprintSpillover(
  accessToken: string,
  cloudId: string,
  input: {
    boardId: number;
    activeSprint: { id: number; name: string; startDate?: string };
    issues: JiraSprintIssue[];
    mapping: JiraMappingSlice;
    maxChangelogLookups?: number;
  },
): Promise<number> {
  const closedSprints = await listBoardSprints(
    accessToken,
    cloudId,
    input.boardId,
    "closed",
  );
  const sorted = [...closedSprints].sort((a, b) => {
    const da = a.endDate ?? "";
    const db = b.endDate ?? "";
    return db.localeCompare(da);
  });

  const sprintStart = input.activeSprint.startDate ?? "";
  const priorSprint =
    sorted.find((s) => {
      const end = s.endDate ?? "";
      return end && sprintStart && end < sprintStart;
    }) ?? sorted[0];

  if (!priorSprint) return 0;

  const openIssues = input.issues.filter(
    (i) => !isIssueDone(i.status, i.statusCategory, input.mapping),
  );
  const candidates = openIssues.slice(0, input.maxChangelogLookups ?? 30);

  let count = 0;
  for (const issue of candidates) {
    try {
      const changes = await fetchIssueSprintChangelog(accessToken, cloudId, issue.key);
      if (
        wasMovedFromPriorSprint(changes, priorSprint.name, input.activeSprint.name)
      ) {
        count++;
      }
    } catch {
      // Best-effort — skip issues we cannot read changelog for.
    }
  }

  return count;
}

/**
 * Resolve spillover count using the strongest available signal:
 * max(carry-over JQL, multi-sprint JQL, issue scan, optional changelog).
 */
export async function resolveSpilloverCount(
  accessToken: string,
  cloudId: string,
  input: {
    sprintId: number;
    sprintStartDate?: string;
    sprintName: string;
    boardId?: number;
    mapping: JiraMappingSlice;
    sprintIssues?: JiraSprintIssue[];
    useChangelog?: boolean;
  },
): Promise<SpilloverCountResult> {
  const results: Array<{ count: number; method: SpilloverCountResult["method"] }> = [];

  try {
    const multi = await countIssuesByJql(
      accessToken,
      cloudId,
      buildMultiSprintSpilloverJql(input.sprintId, input.mapping),
    );
    results.push({ count: multi, method: "multi_sprint" });
  } catch {
    // JQL may fail when sprint functions are unavailable.
  }

  if (input.sprintStartDate) {
    try {
      const carryOver = await countIssuesByJql(
        accessToken,
        cloudId,
        buildCarryOverSpilloverJql(
          input.sprintId,
          input.sprintStartDate,
          input.mapping,
        ),
      );
      results.push({ count: carryOver, method: "carry_over" });
    } catch {
      // Best-effort.
    }
  }

  if (input.sprintIssues) {
    const scanned = countCarryOverFromIssues(
      input.sprintIssues,
      input.sprintStartDate,
      input.mapping,
    );
    results.push({ count: scanned, method: "issue_scan" });
  }

  if (
    input.useChangelog &&
    input.boardId != null &&
    input.sprintIssues &&
    input.sprintIssues.length > 0
  ) {
    const changelogCount = await countChangelogPriorSprintSpillover(
      accessToken,
      cloudId,
      {
        boardId: input.boardId,
        activeSprint: {
          id: input.sprintId,
          name: input.sprintName,
          startDate: input.sprintStartDate,
        },
        issues: input.sprintIssues,
        mapping: input.mapping,
      },
    );
    if (changelogCount > 0) {
      results.push({ count: changelogCount, method: "changelog" });
    }
  }

  if (results.length === 0) {
    return { count: 0, method: "carry_over" };
  }

  const best = results.reduce((a, b) => (b.count > a.count ? b : a));
  return { count: best.count, method: best.method };
}
