import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEGACY_JIRA_MAPPING } from "@/lib/jira-jql";
import type { JiraSprintIssue } from "@/lib/jira-api";
import { countCarryOverFromIssues } from "@/lib/jira-spillover";

describe("jira-spillover", () => {
  it("countCarryOverFromIssues counts open issues created before sprint start", () => {
    const issues: JiraSprintIssue[] = [
      {
        key: "CX-1",
        status: "To Do",
        statusCategory: "new",
        created: "2026-06-10",
      },
      {
        key: "CX-2",
        status: "Done",
        statusCategory: "done",
        created: "2026-06-10",
      },
      {
        key: "CX-3",
        status: "In Progress",
        statusCategory: "indeterminate",
        created: "2026-06-20",
      },
    ];

    const count = countCarryOverFromIssues(
      issues,
      "2026-06-16T00:00:00.000Z",
      LEGACY_JIRA_MAPPING,
    );
    assert.equal(count, 1);
  });
});
