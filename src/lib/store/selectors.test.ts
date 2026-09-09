import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_FILTERS } from "@/lib/store/dimensions";
import { seedAppData } from "@/lib/store/mock";
import {
  selectDeliveryAnalysisSnapshot,
  selectOverviewModel,
} from "@/lib/store/selectors";
import type { AppStoreState } from "@/lib/store/types";

function deliveryState(input: {
  sprint: string;
  team?: string | null;
}): AppStoreState {
  const base = seedAppData();
  return {
    data: base,
    filters: { ...DEFAULT_FILTERS, sprint: input.sprint, team: input.team ?? null },
    status: "ready",
    error: null,
  };
}

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
});
