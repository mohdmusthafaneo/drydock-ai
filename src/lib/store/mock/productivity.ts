import { computeProductivitySnapshot } from "@/lib/productivity/compute-snapshot";
import type { ProductivityDerivedPack } from "@/lib/productivity/types";
import { teamSprintKey } from "@/lib/store/dimensions";
import type { ProductivityData } from "@/lib/store/types";
import type { OverviewDerivedPack } from "@/lib/store/mock/overview-derived";
import {
  CONNEXUS_PRODUCTIVITY_DERIVED,
  TPT_PRODUCTIVITY_DERIVED,
} from "@/lib/store/mock/productivity-derived";

export function buildMockProductivityFromDerived(
  derived: OverviewDerivedPack,
  pack: ProductivityDerivedPack,
): ProductivityData {
  const defaultSprint = derived.defaultSprintId;

  const bySprint: NonNullable<ProductivityData["bySprint"]> = {};
  const byTeam: NonNullable<ProductivityData["byTeam"]> = {};
  const byTeamSprint: NonNullable<ProductivityData["byTeamSprint"]> = {};

  for (const sprint of derived.sprints) {
    bySprint[sprint.id] = computeProductivitySnapshot(pack, derived, {
      team: null,
      sprint: sprint.id,
    });
  }

  for (const team of derived.teams) {
    byTeam[team.key] = computeProductivitySnapshot(pack, derived, {
      team: team.key,
      sprint: defaultSprint,
    });
    for (const sprint of derived.sprints) {
      byTeamSprint[teamSprintKey(team.key, sprint.id)] = computeProductivitySnapshot(
        pack,
        derived,
        { team: team.key, sprint: sprint.id },
      );
    }
  }

  const base = computeProductivitySnapshot(pack, derived, {
    team: null,
    sprint: defaultSprint,
  });

  return { base, byTeam, bySprint, byTeamSprint };
}

export function buildMockProductivityForOrg(
  derived: OverviewDerivedPack,
  orgKey: "tpt" | "connexus",
): ProductivityData {
  const pack =
    orgKey === "connexus"
      ? (CONNEXUS_PRODUCTIVITY_DERIVED as unknown as ProductivityDerivedPack)
      : (TPT_PRODUCTIVITY_DERIVED as unknown as ProductivityDerivedPack);
  return buildMockProductivityFromDerived(derived, pack);
}
