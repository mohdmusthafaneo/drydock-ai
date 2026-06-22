import dynamic from "next/dynamic";

export const ExecutiveBriefingHero = dynamic(() =>
  import("@/components/executive-briefing/executive-briefing-hero").then((mod) => ({
    default: mod.ExecutiveBriefingHero,
  })),
);

export const BriefingBreakdownSection = dynamic(() =>
  import("@/components/executive-briefing/briefing-breakdown-section").then((mod) => ({
    default: mod.BriefingBreakdownSection,
  })),
);

export const BriefingExecutiveDeck = dynamic(() =>
  import("@/components/executive-briefing/briefing-executive-deck").then((mod) => ({
    default: mod.BriefingExecutiveDeck,
  })),
);

export const GovernanceEmptyState = dynamic(() =>
  import("@/components/executive-briefing/governance-empty-state").then((mod) => ({
    default: mod.GovernanceEmptyState,
  })),
);
