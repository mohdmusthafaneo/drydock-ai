import type { AppDimensions } from "@/lib/store/types";
import type { OverviewSprintOption } from "@/lib/overview/types";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";

export { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/overview";

const SPRINTS: OverviewSprintOption[] = TPT_OVERVIEW_DERIVED.sprints.map((s) => ({
  id: s.id,
  name: s.name,
  startLabel: s.startLabel,
  endLabel: s.endLabel,
  rangeLabel: s.rangeLabel,
  start: s.start,
  end: s.end,
}));

const TEAMS = TPT_OVERVIEW_DERIVED.teams.map((t) => ({
  key: t.key,
  name: t.name,
}));

export const MOCK_DIMENSIONS: AppDimensions = {
  teams: TEAMS,
  projects: TEAMS.map((t) => ({ key: t.key, name: t.name })),
  sprints: SPRINTS,
  defaultSprintId: TPT_OVERVIEW_DERIVED.defaultSprintId,
  repos: [
    { id: "tpt-platform", name: "tpt-platform", fullName: "tpt/tpt-platform" },
    { id: "tpt-mobile", name: "tpt-mobile", fullName: "tpt/tpt-mobile" },
  ],
  services: [
    { id: "api-gateway", name: "api-gateway" },
    { id: "web-client", name: "web-client" },
  ],
};
