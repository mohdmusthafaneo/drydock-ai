import type { AppDimensions } from "@/lib/store/types";
import type { OverviewSprintOption } from "@/lib/overview/types";

export { OVERVIEW_LAST_SYNC_AT } from "@/lib/store/mock/overview";

const SPRINTS: OverviewSprintOption[] = [
  {
    id: "37",
    name: "Sprint 37",
    startLabel: "Aug 10",
    endLabel: "Aug 24",
    rangeLabel: "Aug 10 – Aug 24, 2026",
    start: "2026-08-10",
    end: "2026-08-24",
  },
  {
    id: "36",
    name: "Sprint 36",
    startLabel: "Jul 27",
    endLabel: "Aug 9",
    rangeLabel: "Jul 27 – Aug 9, 2026",
    start: "2026-07-27",
    end: "2026-08-09",
  },
  {
    id: "38",
    name: "Sprint 38",
    startLabel: "Aug 25",
    endLabel: "Sep 7",
    rangeLabel: "Aug 25 – Sep 7, 2026",
    start: "2026-08-25",
    end: "2026-09-07",
  },
];

export const MOCK_DIMENSIONS: AppDimensions = {
  teams: [
    { key: "WEB", name: "Connexus Web" },
    { key: "MOB", name: "Mobile App" },
    { key: "DATA", name: "Data Platform" },
    { key: "INFRA", name: "Infrastructure" },
  ],
  projects: [
    { key: "WEB", name: "Connexus Web" },
    { key: "MOB", name: "Mobile App" },
    { key: "DATA", name: "Data Platform" },
    { key: "INFRA", name: "Infrastructure" },
  ],
  sprints: SPRINTS,
  repos: [
    { id: "connexus-web", name: "connexus-web", fullName: "connexus/connexus-web" },
    { id: "connexus-mobile", name: "connexus-mobile", fullName: "connexus/connexus-mobile" },
  ],
  services: [
    { id: "api-gateway", name: "api-gateway" },
    { id: "web-client", name: "web-client" },
  ],
};
