import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCarryOverSpilloverJql,
  buildDoneJql,
  buildMultiSprintSpilloverJql,
  buildSprintDoneJql,
  buildSprintQaPipelineJql,
  LEGACY_JIRA_MAPPING,
} from "@/lib/jira-jql";

describe("jira-jql — done counting", () => {
  it("prefers calibrated doneStatusNames over statusCategory", () => {
    const jql = buildDoneJql('project = "CX"', {
      ...LEGACY_JIRA_MAPPING,
      doneStatusNames: ["Done", "Closed"],
    });
    assert.ok(jql.includes('status IN ("Done", "Closed")'));
    assert.ok(!jql.includes("statusCategory"));
  });

  it("falls back to statusCategory when doneStatusNames absent", () => {
    const jql = buildDoneJql('project = "CX"', LEGACY_JIRA_MAPPING);
    assert.equal(jql, 'project = "CX" AND statusCategory = "Done"');
  });

  it("buildSprintDoneJql scopes to sprint id", () => {
    const jql = buildSprintDoneJql(807, {
      ...LEGACY_JIRA_MAPPING,
      doneStatusNames: ["Done"],
    });
    assert.equal(jql, 'sprint = 807 AND status IN ("Done")');
  });
});

describe("jira-jql — spillover and QA", () => {
  it("buildMultiSprintSpilloverJql filters to open issues", () => {
    const jql = buildMultiSprintSpilloverJql(807, LEGACY_JIRA_MAPPING);
    assert.ok(jql.includes("sprint in closedSprints()"));
    assert.ok(jql.includes('statusCategory != "Done"'));
  });

  it("buildCarryOverSpilloverJql uses sprint start date", () => {
    const jql = buildCarryOverSpilloverJql(
      807,
      "2026-06-16T09:00:00.000Z",
      LEGACY_JIRA_MAPPING,
    );
    assert.ok(jql.includes('created < "2026-06-16"'));
    assert.ok(jql.includes("sprint = 807"));
  });

  it("buildSprintQaPipelineJql targets testing statuses", () => {
    const jql = buildSprintQaPipelineJql(
      807,
      ["Ready for Testing", "In Test", "Ready for review"],
      LEGACY_JIRA_MAPPING,
    );
    assert.ok(jql?.includes("Ready for Testing"));
    assert.ok(jql?.includes("sprint = 807"));
  });
});
