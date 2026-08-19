import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AgentDecision } from "@/lib/agent-analysis/types";
import type { BriefingClaimVerdict } from "@/lib/executive-briefing/types";
import { RevealSection } from "@/components/motion/reveal-section";
import { HoverLift } from "@/components/motion/hover-lift";
import { cn } from "@/lib/utils";

const TONE_BORDER: Record<BriefingClaimVerdict, string> = {
  good: "border-border-subtle bg-pure-white",
  attention: "border-apricot/30 bg-apricot-wash/30",
  risk: "border-rust/20 bg-apricot-wash",
  neutral: "border-border-subtle bg-pure-white",
};

function DecisionCard({ item }: { item: AgentDecision }) {
  const body = (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-[24px] border px-5 py-4 shadow-[var(--shadow)] sm:flex-row sm:items-center sm:justify-between",
        TONE_BORDER[item.tone],
        item.href && "transition-shadow group-hover:shadow-[0_0_0_1px_rgba(163,166,175,0.3),rgba(0,0,0,0.08)_0px_24px_30px_-8px]",
      )}
    >
      <div className="min-w-0">
        <p className="font-display text-[17px] leading-snug tracking-[-0.14px] text-ink">
          {item.title}
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-ash">{item.detail}</p>
      </div>
      {item.href ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[15px] font-medium text-ink group-hover:text-rust">
          {item.ctaLabel ?? "View"}
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
            strokeWidth={1.5}
          />
        </span>
      ) : null}
    </div>
  );

  if (item.href) {
    return (
      <HoverLift>
        <Link href={item.href} className="group block">
          {body}
        </Link>
      </HoverLift>
    );
  }

  return <HoverLift>{body}</HoverLift>;
}

function DecisionGroup({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: AgentDecision[];
}) {
  if (items.length === 0) return null;

  return (
    <RevealSection className="space-y-4">
      <div>
        <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
          {title}
        </h3>
        <p className="mt-1 text-[14px] text-graphite">{description}</p>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <DecisionCard item={item} />
          </li>
        ))}
      </ul>
    </RevealSection>
  );
}

export function AgentDecisionList({
  decisions,
  approvalLevelLabels,
}: {
  decisions: AgentDecision[];
  approvalLevelLabels?: Record<string, string>;
}) {
  const leadership = decisions.filter((d) => d.audience === "leadership");
  const engineering = decisions.filter((d) => d.audience === "engineering");

  const engineeringLabel = approvalLevelLabels?.level3 ?? "For your engineering lead";

  if (decisions.length === 0) return null;

  return (
    <div className="space-y-10">
      <DecisionGroup
        title="Waiting on leadership"
        description="Items that need an executive decision or awareness before the organization ships."
        items={leadership}
      />
      <DecisionGroup
        title={engineeringLabel}
        description="Operational depth to delegate — not for you to monitor daily."
        items={engineering}
      />
    </div>
  );
}
