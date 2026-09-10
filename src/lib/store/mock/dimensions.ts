import type { AppDimensions } from "@/lib/store/types";
import type { OverviewSprintOption } from "@/lib/overview/types";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";
import type { OverviewDerivedPack } from "@/lib/store/mock/overview-derived";

export { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/overview";

const TPT_REPOS = [
  { id: "tpt-platform", name: "tpt-platform", fullName: "tpt/tpt-platform" },
  { id: "tpt-mobile", name: "tpt-mobile", fullName: "tpt/tpt-mobile" },
] as const;

const TPT_SERVICES = [
  { id: "api-gateway", name: "api-gateway" },
  { id: "web-client", name: "web-client" },
] as const;

export function buildMockDimensions(
  derived: OverviewDerivedPack,
  options?: {
    repos?: AppDimensions["repos"];
    services?: AppDimensions["services"];
  },
): AppDimensions {
  const sprints: OverviewSprintOption[] = derived.sprints.map((s) => ({
    id: s.id,
    name: s.name,
    startLabel: s.startLabel,
    endLabel: s.endLabel,
    rangeLabel: s.rangeLabel,
    start: s.start,
    end: s.end,
  }));
  const teams = derived.teams.map((t) => ({ key: t.key, name: t.name }));

  return {
    teams,
    projects: teams.map((t) => ({ key: t.key, name: t.name })),
    sprints,
    defaultSprintId: derived.defaultSprintId,
    repos: options?.repos ?? [...TPT_REPOS],
    services: options?.services ?? [...TPT_SERVICES],
  };
}

export const MOCK_DIMENSIONS: AppDimensions = buildMockDimensions(
  TPT_OVERVIEW_DERIVED as unknown as OverviewDerivedPack,
);
