import type { SettingsData } from "@/lib/store/types";

export const mockSettings: SettingsData = {
  organizationName: "Connexus",
  members: [
    {
      id: "usr-krishna-nair",
      name: "Krishna Nair",
      email: "krishna.nair@connexus.com",
      role: "ORG_ADMIN",
    },
    {
      id: "usr-priya-menon",
      name: "Priya Menon",
      email: "priya.menon@connexus.com",
      role: "DELIVERY_MANAGER",
    },
    {
      id: "usr-alex-chen",
      name: "Alex Chen",
      email: "alex.chen@connexus.com",
      role: "QA_LEAD",
    },
    {
      id: "usr-jordan-lee",
      name: "Jordan Lee",
      email: "jordan.lee@connexus.com",
      role: "DEVELOPER",
    },
  ],
};
