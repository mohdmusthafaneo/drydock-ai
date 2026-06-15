import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildProjectScopeClause,
  scopeJqlToProjects,
} from "./jira-tools";

describe("jira-tools JQL scoping", () => {
  it("builds a single-project scope clause", () => {
    assert.equal(buildProjectScopeClause(["ABC"]), 'project = "ABC"');
  });

  it("builds a multi-project scope clause", () => {
    assert.equal(
      buildProjectScopeClause(["ABC", "DEF"]),
      'project in ("ABC", "DEF")',
    );
  });

  it("scopes custom JQL to org projects", () => {
    assert.equal(
      scopeJqlToProjects('issuetype = Bug AND status != Done', ["AIDOS"]),
      'project = "AIDOS" AND (issuetype = Bug AND status != Done)',
    );
  });

  it("preserves JQL that already includes a project filter", () => {
    const jql = 'project = "AIDOS" AND status = Blocked';
    assert.equal(scopeJqlToProjects(jql, ["AIDOS"]), jql);
  });
});
