import Link from "next/link";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BriefingInsight } from "@/lib/executive-briefing/types";

type Props = {
  insight: BriefingInsight;
  className?: string;
};

export function BriefingInsightBox({ insight, className }: Props) {
  const isCritical = insight.tone === "critical";
  const isAttention = insight.tone === "attention";

  const content = (
    <>
      {isCritical || isAttention ? (
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-rust"
          strokeWidth={1.5}
          aria-hidden
        />
      ) : (
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-chart-blue" strokeWidth={1.5} aria-hidden />
      )}
      <p
        className={cn(
          "flex-1 font-display text-[16px] leading-[1.35] tracking-[-0.14px]",
          isCritical || isAttention ? "text-rust" : "text-ink",
        )}
      >
        {insight.message}
      </p>
      {insight.href && (
        <ArrowRight
          className="mt-0.5 h-4 w-4 shrink-0 text-graphite"
          strokeWidth={1.5}
          aria-hidden
        />
      )}
    </>
  );

  const boxClass = cn(
    "flex gap-3 rounded-[16px] px-4 py-3",
    isCritical || isAttention ? "bg-apricot-wash" : "bg-sky-wash",
    insight.href && "transition-opacity hover:opacity-90",
    className,
  );

  if (insight.href) {
    return (
      <Link href={insight.href} className={boxClass} role="status">
        {content}
      </Link>
    );
  }

  return (
    <div className={boxClass} role="status">
      {content}
    </div>
  );
}
