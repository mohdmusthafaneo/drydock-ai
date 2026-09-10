import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_FILTERS } from "@/lib/store/dimensions";
import {
  CONNEXUS_DEMO_EMAIL,
  TPT_DEMO_EMAIL,
  resolveMockSeed,
  seedAppData,
} from "@/lib/store/mock";
import {
  selectDeliveryAnalysisSnapshot,
  selectOverviewModel,
} from "@/lib/store/selectors";
import type { AppStoreState } from "@/lib/store/types";

function stateFromSeed(
  seed: ReturnType<typeof resolveMockSeed>,
  input: { sprint?: string | null; team?: string | null },
): AppStoreState {
  return {
    data: seed,
    filters: {
      ...DEFAULT_FILTERS,
      sprint: input.sprint ?? null,
      team: input.team ?? null,
    },
    status: "ready",
    error: null,
  };
}

function deliveryState(input: {
  sprint: string;
  team?: string | null;
}): AppStoreState {
  return stateFromSeed(seedAppData(), input);
}

describe("resolveMockSeed", () => {
  it("maps tpt@neoito.com to TPT teams and default sprint 27", () => {
    const seed = resolveMockSeed({ email: TPT_DEMO_EMAIL });
    assert.equal(seed.org.name, "TPT Platform");
    assert.equal(seed.dimensions.defaultSprintId, "27");
    assert.deepEqual(
      seed.dimensions.teams.map((t) => t.key),
      ["AVENGERS", "APEX", "DARK", "MOBILE"],
    );
    assert.equal(seed.integrations.items[0]?.projectKeys?.[0], "TP");
    assert.equal(seed.settings.organizationName, "TPT Platform");
  });

  it("maps connexus@neoito.com to a single CONNEXUS team and sprint 37", () => {
    const seed = resolveMockSeed({ email: CONNEXUS_DEMO_EMAIL });
    assert.equal(seed.org.name, "Connexus");
    assert.equal(seed.dimensions.defaultSprintId, "37");
    assert.deepEqual(
      seed.dimensions.teams.map((t) => t.key),
      ["CONNEXUS"],
    );
    assert.deepEqual(
      seed.dimensions.sprints.map((s) => s.id),
      ["37", "36", "35", "34"],
    );
    assert.equal(seed.integrations.items[0]?.projectKeys?.[0], "CX");
    assert.equal(
      seed.integrations.items[0]?.siteUrl,
      "https://neoito-team-connexus.atlassian.net",
    );
    assert.equal(seed.settings.organizationName, "Connexus");
  });

  it("falls back to TPT for unknown emails", () => {
    const seed = resolveMockSeed({ email: "someone@example.com" });
    assert.equal(seed.dimensions.defaultSprintId, "27");
    assert.equal(seed.org.name, "TPT Platform");
  });

  it("serves Connexus Overview metrics for sprint 37", () => {
    const seed = resolveMockSeed({ email: CONNEXUS_DEMO_EMAIL });
    const model = selectOverviewModel(stateFromSeed(seed, { sprint: "37" }));
    assert.equal(model.deliveryConfidence.score, 61);
    assert.equal(model.deliveryConfidence.band, "Caution");
    const completion = model.deliveryConfidence.metrics.find(
      (m) => m.id === "completion",
    );
    assert.equal(completion?.value, "67%");
    assert.equal(completion?.annotation, "79 / 118");
  });
});

describe("selectOverviewModel", () => {
  it("returns store metrics for the selected sprint", () => {
    const model = selectOverviewModel(deliveryState({ sprint: "27" }));
    const metric = model.deliveryConfidence.metrics.find(
      (m) => m.id === "spillover" || m.id === "at-risk",
    );
    const takeaway = model.keyTakeaways.find((t) => t.id === "at-risk");

    assert.equal(metric?.value, 52);
    assert.equal(takeaway?.title, "52 items at risk");
  });

  it("updates spillover when the sprint filter changes", () => {
    const sprint27 = selectOverviewModel(deliveryState({ sprint: "27" }));
    const sprint24 = selectOverviewModel(deliveryState({ sprint: "24" }));
    const metric27 = sprint27.deliveryConfidence.metrics.find(
      (m) => m.id === "spillover" || m.id === "at-risk",
    );
    const metric24 = sprint24.deliveryConfidence.metrics.find(
      (m) => m.id === "spillover" || m.id === "at-risk",
    );

    assert.equal(metric27?.value, 52);
    assert.equal(metric24?.value, 6);
  });
});

describe("selectDeliveryAnalysisSnapshot", () => {
  it("rebuilds signals and KPIs when the sprint filter changes", () => {
    const sprint27 = selectDeliveryAnalysisSnapshot(deliveryState({ sprint: "27" }));
    const sprint24 = selectDeliveryAnalysisSnapshot(deliveryState({ sprint: "24" }));

    assert.equal(sprint27.scopeLabel, "Sprint 27");
    assert.equal(sprint24.scopeLabel, "Sprint 24");
    assert.equal(sprint27.kpis.spillover, 52);
    assert.equal(sprint24.kpis.spillover, 6);
    assert.equal(sprint27.kpis.blocked, 16);
    assert.equal(sprint24.kpis.blocked, 0);

    const spill27 = sprint27.signals.find((s) => s.id === "spillover");
    const spill24 = sprint24.signals.find((s) => s.id === "spillover");
    assert.match(spill27?.value ?? "", /52/);
    assert.match(spill24?.value ?? "", /6/);
    assert.equal(
      sprint27.signals.some((s) => s.id === "version-slip"),
      false,
    );
  });

  it("scopes hygiene and versions to a team leaf", () => {
    const snapshot = selectDeliveryAnalysisSnapshot(
      deliveryState({ sprint: "27", team: "AVENGERS" }),
    );
    assert.deepEqual(snapshot.projectKeys, ["AVENGERS"]);
    assert.equal(snapshot.byProject.length, 1);
    assert.equal(snapshot.byProject[0]?.key, "AVENGERS");
    assert.equal(snapshot.kpis.spillover, snapshot.byProject[0]?.spilloverCount);
  });

  it("scopes Connexus delivery to the single CONNEXUS team", () => {
    const seed = resolveMockSeed({ email: CONNEXUS_DEMO_EMAIL });
    const snapshot = selectDeliveryAnalysisSnapshot(
      stateFromSeed(seed, { sprint: "37", team: "CONNEXUS" }),
    );
    assert.deepEqual(snapshot.projectKeys, ["CONNEXUS"]);
    assert.equal(snapshot.scopeLabel, "Sprint 37");
    assert.equal(snapshot.kpis.sprintCompletionPct, 67);
  });
});
