import type { SettingsData } from "@/lib/store/types";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";
import type { OverviewDerivedPack } from "@/lib/store/mock/overview-derived";

const TPT_MEMBERS: SettingsData["members"] = [
  {
    id: "usr-krishna-nair",
    name: "Krishna Nair",
    email: "krishna.nair@tpt.example",
    role: "ORG_ADMIN",
  },
  {
    id: "usr-priya-menon",
    name: "Priya Menon",
    email: "priya.menon@tpt.example",
    role: "DELIVERY_MANAGER",
  },
  {
    id: "usr-alex-chen",
    name: "Alex Chen",
    email: "alex.chen@tpt.example",
    role: "QA_LEAD",
  },
  {
    id: "usr-jordan-lee",
    name: "Jordan Lee",
    email: "jordan.lee@tpt.example",
    role: "DEVELOPER",
  },
];

export const CONNEXUS_SETTINGS_MEMBERS: SettingsData["members"] = [
  {
    id: "usr-connexus-admin",
    name: "Connexus Admin",
    email: "connexus@neoito.com",
    role: "ORG_ADMIN",
  },
  {
    id: "usr-connexus-delivery",
    name: "Delivery Lead",
    email: "delivery@connexus.example",
    role: "DELIVERY_MANAGER",
  },
  {
    id: "usr-connexus-qa",
    name: "QA Lead",
    email: "qa@connexus.example",
    role: "QA_LEAD",
  },
];

export function buildMockSettings(
  derived: OverviewDerivedPack,
  members: SettingsData["members"] = TPT_MEMBERS,
): SettingsData {
  return {
    organizationName: derived.orgName,
    members,
  };
}

export const mockSettings: SettingsData = buildMockSettings(
  TPT_OVERVIEW_DERIVED as unknown as OverviewDerivedPack,
);
