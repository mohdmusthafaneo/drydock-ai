import type { SettingsData } from "@/lib/store/types";
import { TPT_OVERVIEW_DERIVED } from "@/lib/store/mock/tpt-overview-derived";

export const mockSettings: SettingsData = {
  organizationName: TPT_OVERVIEW_DERIVED.orgName,
  members: [
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
  ],
};
