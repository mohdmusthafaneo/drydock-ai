import type { JiraSprintIssue } from "@/lib/jira-api";
import type { JiraMappingSlice } from "@/lib/jira-jql";
import type {
  JiraAssigneeWorkload,
  JiraSprintStoryPoints,
} from "@/lib/jira-meta";

/** Default QA pipeline statuses (Connexus CX workflow). */
export const DEFAULT_QA_PIPELINE_STATUSES = [
  "Ready for Testing",
  "In Test",
  "Ready for review",
] as const;

/** Whether an issue counts as done — prefers calibrated status names. */
export function isIssueDone(
  status: string,
  statusCategory: string,
  mapping: JiraMappingSlice,
): boolean {
  const doneNames = mapping.doneStatusNames?.filter((n) => n.trim().length > 0);
  if (doneNames && doneNames.length > 0) {
    const norm = status.toLowerCase();
    return doneNames.some((n) => n.toLowerCase() === norm);
  }
  const cat = statusCategory.toLowerCase();
  return cat === "done" || cat === mapping.doneStatusCategory.toLowerCase();
}

function normalizeStatusName(name: string): string {
  return name.toLowerCase().trim();
}

export function isQaPipelineStatus(
  status: string,
  qaStatusNames: readonly string[] = DEFAULT_QA_PIPELINE_STATUSES,
): boolean {
  const norm = normalizeStatusName(status);
  return qaStatusNames.some(
    (qa) => norm === normalizeStatusName(qa) || norm.includes(normalizeStatusName(qa)),
  );
}

export type SprintAggregates = {
  committed: number;
  done: number;
  open: number;
  statusByName: Record<string, number>;
  qaPipelineCount: number;
  storyPoints: JiraSprintStoryPoints;
  assigneeWorkload: JiraAssigneeWorkload[];
};

export function aggregateSprintIssues(
  issues: JiraSprintIssue[],
  mapping: JiraMappingSlice,
  qaStatusNames: readonly string[] = DEFAULT_QA_PIPELINE_STATUSES,
): SprintAggregates {
  const statusByName: Record<string, number> = {};
  const assigneeCounts = new Map<string, number>();
  let done = 0;
  let qaPipelineCount = 0;
  let spCommitted = 0;
  let spDone = 0;
  let unestimatedIssues = 0;

  for (const issue of issues) {
    statusByName[issue.status] = (statusByName[issue.status] ?? 0) + 1;

    const issueDone = isIssueDone(issue.status, issue.statusCategory, mapping);
    if (issueDone) {
      done++;
    } else {
      if (isQaPipelineStatus(issue.status, qaStatusNames)) {
        qaPipelineCount++;
      }
      const assignee = issue.assignee?.trim() || "Unassigned";
      assigneeCounts.set(assignee, (assigneeCounts.get(assignee) ?? 0) + 1);
    }

    const pts = issue.storyPoints;
    if (pts == null || Number.isNaN(pts)) {
      unestimatedIssues++;
    } else {
      spCommitted += pts;
      if (issueDone) {
        spDone += pts;
      }
    }
  }

  const assigneeWorkload = [...assigneeCounts.entries()]
    .map(([assignee, openCount]) => ({ assignee, openCount }))
    .sort((a, b) => b.openCount - a.openCount);

  return {
    committed: issues.length,
    done,
    open: issues.length - done,
    statusByName,
    qaPipelineCount,
    storyPoints: {
      committed: spCommitted,
      done: spDone,
      unestimatedIssues,
    },
    assigneeWorkload,
  };
}

/** Days past sprint end date (0 when not overdue). Uses calendar-day difference. */
export function sprintDaysOverdue(endDate: string | undefined): number {
  if (!endDate) return 0;
  const end = new Date(endDate.slice(0, 10));
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - end.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}
