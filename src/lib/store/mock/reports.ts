import type { ReportsData } from "@/lib/store/types";

export const mockReports: ReportsData = {
  available: true,
  title: "Connexus reports",
  description:
    "Exportable sections for Sprint 37 delivery confidence and attention evidence.",
  sections: [
    {
      id: "delivery-confidence",
      title: "Delivery confidence",
      body: "Sprint 37 sits at Caution (48). Completion is 59% (69 / 117) with 31 blocked items and 16 spillover candidates in the evidence set.",
    },
    {
      id: "attention-summary",
      title: "Attention summary",
      body: "Two open attention items: blocked work without owners, and schedule spillover risk. Neither was silently suppressed — both link back to Overview claims.",
    },
  ],
};
