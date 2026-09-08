import type { SettingsData } from "@/lib/store/types";

export const mockSettings: SettingsData = {
  organizationName: "Connexus",
  members: [
    {
      id: "mock-user-krishna",
      name: "Krishna",
      email: "krishna@connexus.example",
      role: "ORG_ADMIN",
    },
    {
      id: "mock-user-priya",
      name: "Priya",
      email: "priya@connexus.example",
      role: "DELIVERY_MANAGER",
    },
    {
      id: "mock-user-alex",
      name: "Alex",
      email: "alex@connexus.example",
      role: "QA_LEAD",
    },
  ],
};
