import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildJiraIssuesSearchUrl,
  buildOverdueJql,
  buildProjectScopeClause,
  buildUnassignedJql,
  jqlForKpi,
  jqlForSignal,
  jqlForHygieneFinding,
  type JiraLinkContext,
} from "@/lib/jira-issue-links";
import {
  buildBlockedJql,
  buildPortfolioSpilloverJql,
  buildReopenedJql,
  buildSpilloverJql,
} from "@/lib/jira-jql";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";

const mapping: ToolchainMapping = {
  jira: {
    methodology: "scrum",
    usesSprints: true,
    releaseTracking: "fixVersion",
    blockedStatusName: "On hold",
    bugIssueType: "Bug",
    doneStatusCategory: "Done",
    doneStatusNames: ["Done", "Closed"],
    storyPointField: { id: "customfield_10016", name: "Story Points" },
  },
};

const ctx: JiraLinkContext = {
  siteUrl: "https://neoito-team-connexus.atlassian.net",
  mapping,
  projectKeys: ["CX", "AI"],
};

describe("buildJiraIssuesSearchUrl", () => {
  it("encodes JQL and strips trailing slash from site URL", () => {
    const url = buildJiraIssuesSearchUrl(
      "https://neoito-team-connexus.atlassian.net/",
      "created >= -30d order by created DESC",
    );
    assert.equal(
      url,
      "https://neoito-team-connexus.atlassian.net/issues/?jql=created%20%3E%3D%20-30d%20order%20by%20created%20DESC",
    );
  });
});

describe("buildProjectScopeClause", () => {
  it("uses single-project clause for one key", () => {
    assert.equal(buildProjectScopeClause(["CX"]), 'project = "CX"');
  });

  it("uses in-clause for multiple keys", () => {
    assert.equal(buildProjectScopeClause(["CX", "AI"]), 'project in ("CX", "AI")');
  });
});

describe("JQL parity with sync", () => {
  const base = 'project = "CX"';
  const slice = {
    blockedStatusName: "On hold",
    bugIssueType: "Bug",
    doneStatusCategory: "Done" as const,
  };

  it("blocked JQL matches jira-jql builder", () => {
    const expected = buildBlockedJql(base, slice);
    assert.equal(
      jqlForKpi("blocked", { ...ctx, projectKeys: ["CX"] }),
      expected,
    );
  });

  it("overdue JQL matches sync pattern", () => {
    const expected = buildOverdueJql(base, slice);
    assert.equal(
      jqlForKpi("overdue", { ...ctx, projectKeys: ["CX"] }),
      expected,
    );
  });

  it("unassigned hygiene JQL matches sync pattern", () => {
    const expected = buildUnassignedJql(base, slice);
    assert.equal(jqlForHygieneFinding("high-unassigned", "CX", { ...ctx, projectKeys: ["CX"] }), expected);
  });

  it("reopened JQL requires done status names", () => {
    assert.equal(buildReopenedJql(base, slice), null);
    const withDone = buildReopenedJql(base, {
      ...slice,
      doneStatusNames: ["Done"],
    });
    assert.equal(
      withDone,
      `${base} AND status CHANGED FROM ("Done") AND statusCategory != "Done"`,
    );
  });

  it("spillover JQL matches sprint carry-over pattern", () => {
    assert.equal(buildSpilloverJql(42), "sprint = 42 AND sprint in closedSprints()");
  });
});

describe("jqlForSignal", () => {
  it("returns sprint JQL when sprint id provided", () => {
    assert.equal(jqlForSignal("sprint-CX", ctx, { sprintId: 42 }), "sprint = 42");
  });

  it("returns null for stale-sync", () => {
    assert.equal(jqlForSignal("stale-sync", ctx), null);
  });

  it("returns fix version JQL when version name provided", () => {
    const jql = jqlForSignal("version-slip", ctx, { versionName: "v1.2", projectKey: "CX" });
    assert.ok(jql?.includes('fixVersion = "v1.2"'));
    assert.ok(jql?.includes('project = "CX"'));
  });

  it("returns reopened JQL when done status names configured", () => {
    const jql = jqlForSignal("reopened-cluster", { ...ctx, projectKeys: ["CX"] });
    assert.ok(jql?.includes('status CHANGED FROM ("Done", "Closed")'));
    assert.ok(jql?.includes('statusCategory != "Done"'));
  });

  it("returns spillover JQL for sprint id", () => {
    assert.equal(
      jqlForSignal("spillover", ctx, { sprintId: 99 }),
      buildSpilloverJql(99),
    );
  });

  it("returns portfolio spillover JQL without sprint id", () => {
    const jql = jqlForSignal("spillover", ctx);
    assert.equal(jql, buildPortfolioSpilloverJql('project in ("CX", "AI")'));
  });
});

describe("jqlForHygieneFinding", () => {
  it("skips missing-estimates when story point field unset", () => {
    const noFieldCtx: JiraLinkContext = {
      ...ctx,
      mapping: {
        jira: {
          methodology: "scrum",
          usesSprints: true,
          releaseTracking: "fixVersion",
          blockedStatusName: "Blocked",
          bugIssueType: "Bug",
          doneStatusCategory: "Done",
        },
      },
      projectKeys: ["CX"],
    };
    assert.equal(jqlForHygieneFinding("missing-estimates", "CX", noFieldCtx), null);
  });

  it("builds missing-estimates JQL with custom field id", () => {
    const jql = jqlForHygieneFinding("missing-estimates", "CX", { ...ctx, projectKeys: ["CX"] });
    assert.ok(jql?.includes("customfield_10016 is EMPTY"));
  });
});
