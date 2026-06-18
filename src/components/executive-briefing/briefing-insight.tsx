import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BriefingInsight } from "@/lib/executive-briefing/types";

type Props = {
  insight: BriefingInsight;
  className?: string;
};

export function BriefingInsightBox({ insight, className }: Props) {
  const isCritical = insight.tone === "critical";
  const isAttention = insight.tone === "attention";

  return (
    <div
      className={cn(
        "flex gap-3 rounded-[16px] px-4 py-3",
        isCritical || isAttention ? "bg-apricot-wash" : "bg-sky-wash",
        className,
      )}
      role="status"
    >
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
          "font-display text-[16px] leading-[1.35] tracking-[-0.14px]",
          isCritical || isAttention ? "text-rust" : "text-ink",
        )}
      >
        {insight.message}
      </p>
    </div>
  );
}
