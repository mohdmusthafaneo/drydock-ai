import type { EscapesData } from "@/lib/store/types";

/** Production misses used to check release advice against reality (demo). */
export const mockEscapes: EscapesData = {
  items: [
    {
      id: "esc-1",
      title: "Guest checkout tax miscalculated for EU VAT regions",
      summary:
        "Suite stayed green: guest checkout completes with valid card never asserted tax line items. Caught in production after Sprint 36.",
      status: "INVESTIGATING",
      releaseName: "Connexus Sprint 36",
      createdAt: "2026-08-29T14:20:00Z",
    },
    {
      id: "esc-2",
      title: "Payment webhook duplicate ACK caused double capture",
      summary:
        "Flaky webhook test was skipped for two weeks. Production miss on duplicate delivery. Replay shows the suite would have caught it if not skipped.",
      status: "OPEN",
      releaseName: "Connexus Sprint 37",
      createdAt: "2026-09-02T09:05:00Z",
    },
  ],
};
