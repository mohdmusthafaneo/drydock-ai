import type { AgentPageView } from "@/lib/agent-analysis/types";
import { ExecutiveVerdictBanner } from "@/components/executive-briefing/executive-verdict-banner";
import { BriefingHighlights } from "@/components/executive-briefing/briefing-highlights";
import { AgentDecisionList } from "@/components/agent-analysis/agent-decision-list";
import { RevealSection } from "@/components/motion/reveal-section";

type Props = {
  view: AgentPageView;
  children?: React.ReactNode;
  /** Optional content between highlights and decisions (e.g. clustered findings). */
  afterHighlights?: React.ReactNode;
  /** Optional org-configurable role labels for dynamic audience naming. */
  approvalLevelLabels?: Record<string, string>;
  /** Override engineering decision section chrome (title + description). */
  engineeringSection?: { title: string; description: string };
  /** Override leadership decision section chrome (title + description). */
  leadershipSection?: { title: string; description: string };
};
/**
 * Shared executive layout for agent analysis pages:
 * verdict hero → scope → highlights → optional mid slot → decide/delegate → detail children.
 */
export function AgentPageShell({
  view,
  children,
  afterHighlights,
  approvalLevelLabels,
  engineeringSection,
  leadershipSection,
}: Props) {
  return (
    <div className="space-y-[13px]">
      <div className="space-y-3">
        <ExecutiveVerdictBanner
          verdict={view.hero.verdict}
          verdictLabel={view.hero.verdictLabel}
          headline={view.hero.headline}
          subcopy={view.hero.subcopy}
        />
        {view.scope ? (
          <p className="px-1 text-[12px] text-graphite">{view.scope}</p>
        ) : null}
      </div>

      {view.highlights.length > 0 ? (
        <RevealSection>
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]">
            <BriefingHighlights highlights={view.highlights} bare />
          </div>
        </RevealSection>
      ) : null}

      {afterHighlights}
      <AgentDecisionList
        decisions={view.decisions}
        approvalLevelLabels={approvalLevelLabels}
        engineeringSection={engineeringSection}
        leadershipSection={leadershipSection}
      />

      {children}
    </div>
  );
}
