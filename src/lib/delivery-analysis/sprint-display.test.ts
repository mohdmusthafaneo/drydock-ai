import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeSprintCardSeverity,
  resolveActiveSprintCards,
  sprintMatchesSelection,
} from "@/lib/delivery-analysis/sprint-display";
import { formatSprintDay } from "@/lib/format-date";

describe("sprint-display", () => {
  it("formats Jira ISO datetimes as calendar days", () => {
    assert.equal(formatSprintDay("2026-07-20T04:30:17.761Z"), "Jul 20, 2026");
    assert.equal(formatSprintDay("2026-08-21T11:30:00.000Z"), "Aug 21, 2026");
    assert.equal(formatSprintDay("2026-09-08"), "Sep 8, 2026");
  });

  it("matches selection by sprint id or name", () => {
    assert.equal(
      sprintMatchesSelection(
        {
          projectKey: "CX",
          projectName: "Connexus",
          name: "Sprint 37",
          state: "active",
          done: 1,
          committed: 2,
          pct: 50,
          sprintId: 37,
        },
        { id: "37", name: "Sprint 37" },
      ),
      true,
    );
    assert.equal(
      sprintMatchesSelection(
        {
          projectKey: "TP",
          projectName: "TPT",
          name: "Sprint 27",
          state: "active",
          done: 1,
          committed: 2,
          pct: 50,
        },
        { id: "27", name: "Sprint 27" },
      ),
      true,
    );
  });

  it("marks overdue low-completion sprints critical", () => {
    assert.equal(
      computeSprintCardSeverity({
        pct: 59,
        endDate: "2026-08-21",
        state: "active",
        daysOverdue: 18,
      }),
      "critical",
    );
  });

  it("synthesizes Overview sprint when Delivery rows do not match", () => {
    const rows = resolveActiveSprintCards({
      sprints: [
        {
          projectKey: "CX",
          projectName: "Connexus",
          name: "Sprint 37",
          state: "active",
          startDate: "2026-07-20T04:30:17.761Z",
          endDate: "2026-08-21T11:30:00.000Z",
          done: 69,
          committed: 117,
          pct: 59,
          daysOverdue: 3,
          severity: "warning",
        },
      ],
      selectedSprint: {
        id: "27",
        name: "Sprint 27",
        start: "2026-08-31T10:27:00.000Z",
        end: "2026-09-10T23:00:00.000Z",
      },
      overviewCompletion: { done: 74, total: 244, pct: 30 },
      teamKey: null,
      teamName: null,
      fallbackProjectKey: "TP",
      fallbackProjectName: "TPT Platform",
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "Sprint 27");
    assert.equal(rows[0]!.done, 74);
    assert.equal(rows[0]!.committed, 244);
    assert.equal(rows[0]!.pct, 30);
    assert.equal(rows[0]!.startDate, "2026-08-31T10:27:00.000Z");
    assert.equal(rows[0]!.endDate, "2026-09-10T23:00:00.000Z");
    assert.equal(rows[0]!.projectKey, "TP");
  });
});
