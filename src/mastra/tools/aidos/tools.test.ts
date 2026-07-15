import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AIDOS_TOOL_IDS } from "./names";
import { aidosTools } from "./tools";

describe("aidos tools", () => {
  it("exports a tool for every AIDOS_TOOL_ID", () => {
    for (const id of AIDOS_TOOL_IDS) {
      assert.ok(aidosTools[id], `missing tool: ${id}`);
      assert.equal(aidosTools[id].id, id);
    }
  });

  it("exposes only the read-only assistant toolset", () => {
    assert.deepEqual([...AIDOS_TOOL_IDS].sort(), [
      "aidos_get_code_analysis",
      "aidos_get_integration_health",
      "aidos_get_jira_context",
      "aidos_get_org_context",
      "aidos_get_release_readiness",
      "aidos_list_approvals",
      "aidos_list_compliance_findings",
      "aidos_list_incidents",
      "aidos_list_predictions",
      "aidos_list_recommendations",
      "aidos_list_releases",
      "aidos_query_jira_jql",
    ]);
  });
});
