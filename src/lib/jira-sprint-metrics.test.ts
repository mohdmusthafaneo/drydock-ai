import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEGACY_JIRA_MAPPING } from "@/lib/jira-jql";
import type { JiraSprintIssue } from "@/lib/jira-api";
import {
  aggregateSprintIssues,
  isIssueDone,
  isQaPipelineStatus,
  sprintDaysOverdue,
} from "@/lib/jira-sprint-metrics";

const mapping = {
  ...LEGACY_JIRA_MAPPING,
  doneStatusNames: ["Done"],
};

function issue(
  partial: Partial<JiraSprintIssue> & Pick<JiraSprintIssue, "key" | "status">,
): JiraSprintIssue {
  return {
    statusCategory: partial.status === "Done" ? "done" : "indeterminate",
    ...partial,
  };
}

describe("jira-sprint-metrics", () => {
  it("isIssueDone prefers status name over category", () => {
    assert.equal(isIssueDone("Done", "indeterminate", mapping), true);
    assert.equal(isIssueDone("Ready for Testing", "done", mapping), false);
  });

  it("isQaPipelineStatus matches Connexus QA lane", () => {
    assert.equal(isQaPipelineStatus("Ready for Testing"), true);
    assert.equal(isQaPipelineStatus("In Progress"), false);
  });

  it("aggregateSprintIssues computes Connexus-like sprint 35 metrics", () => {
    const issues: JiraSprintIssue[] = [
      ...Array.from({ length: 49 }, (_, i) =>
        issue({ key: `CX-D${i}`, status: "Done", statusCategory: "done" }),
      ),
      ...Array.from({ length: 9 }, (_, i) =>
        issue({
          key: `CX-Q${i}`,
          status: "Ready for Testing",
          assignee: "Tester",
        }),
      ),
      issue({ key: "CX-1", status: "In Test", assignee: "A" }),
      issue({ key: "CX-2", status: "Ready for review", assignee: "B" }),
      ...Array.from({ length: 14 }, (_, i) =>
        issue({
          key: `CX-O${i}`,
          status: "To Do",
          created: "2026-06-10",
          storyPoints: i < 5 ? 5 : null,
          assignee: "Dev",
        }),
      ),
    ];

    const agg = aggregateSprintIssues(issues, mapping);
    assert.equal(agg.committed, 74);
    assert.equal(agg.done, 49);
    assert.equal(agg.qaPipelineCount, 11);
    assert.equal(agg.statusByName["Ready for Testing"], 9);
    assert.equal(agg.storyPoints.committed, 25);
    assert.equal(agg.storyPoints.done, 0);
    assert.ok(agg.assigneeWorkload[0]!.openCount >= 3);
  });

  it("sprintDaysOverdue counts days past end date", () => {
    const days = sprintDaysOverdue("2026-06-30");
    assert.ok(days >= 6);
  });
});
