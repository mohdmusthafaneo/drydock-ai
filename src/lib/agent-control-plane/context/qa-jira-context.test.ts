import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatQaJiraContextMarkdown } from "./qa-jira-context";

describe("formatQaJiraContextMarkdown", () => {
  it("reports disconnected Jira", () => {
    const markdown = formatQaJiraContextMarkdown({
      connected: false,
      projectKeys: [],
      mapping: {
        blockedStatusName: "Blocked",
        bugIssueType: "Bug",
        doneStatusCategory: "Done",
      },
      releaseTracking: "fixVersion",
    });

    assert.match(markdown, /not connected/);
    assert.match(markdown, /aidos_query_jira_jql/);
  });

  it("includes board, sprint, and mapping details when connected", () => {
    const markdown = formatQaJiraContextMarkdown({
      connected: true,
      siteName: "Acme Jira",
      siteUrl: "https://acme.atlassian.net",
      projectKeys: ["AIDOS"],
      snapshot: {
        syncedAt: "2026-06-14T10:00:00.000Z",
        projects: [
          {
            key: "AIDOS",
            name: "AIDOS Platform",
            openIssues: 24,
            blockedCount: 2,
            overdueCount: 1,
            bugsOpen: 3,
            unassignedCount: 5,
            statusBreakdown: { todo: 8, inProgress: 6, done: 45 },
            versions: [
              {
                id: "1",
                name: "v2.4",
                released: false,
                overdue: true,
                openIssuesInVersion: 12,
              },
            ],
            board: { id: 42, name: "AIDOS Scrum Board", type: "scrum" },
            activeSprint: {
              id: 100,
              name: "Sprint 42",
              state: "active",
              committed: 18,
              done: 11,
            },
          },
        ],
      },
      mapping: {
        blockedStatusName: "Blocked",
        bugIssueType: "Bug",
        doneStatusCategory: "Done",
      },
      releaseTracking: "fixVersion",
    });

    assert.match(markdown, /Acme Jira/);
    assert.match(markdown, /AIDOS Scrum Board/);
    assert.match(markdown, /Sprint 42/);
    assert.match(markdown, /sprint = 100/);
    assert.match(markdown, /open_bugs/);
    assert.match(markdown, /Blocked status: Blocked/);
    assert.match(markdown, /open 12/);
  });
});
