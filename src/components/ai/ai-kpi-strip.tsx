import type { CursorAiRoi } from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";

type KpiItem = {
  key: string;
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "error" | "default";
};

export function AiKpiStrip({
  roi,
  className,
}: {
  roi: CursorAiRoi;
  className?: string;
}) {
  const positive = roi.netValueUsd >= 0;
  const items: KpiItem[] = [
    {
      key: "net",
      label: "Net value",
      value: `${positive ? "+" : "−"}$${Math.abs(roi.netValueUsd).toLocaleString()}`,
      hint: "Eng cost avoided − AI cost",
      tone: positive ? "success" : "error",
    },
    {
      key: "multiple",
      label: "ROI multiple",
      value: roi.roiMultiple == null ? "—" : `${roi.roiMultiple}×`,
      hint: "Return vs seats + tokens",
    },
    {
      key: "hours",
      label: "Eng hours saved",
      value: `${roi.engHoursSaved.toLocaleString()}h`,
      hint: `${roi.aiLinesAccepted.toLocaleString()} AI lines accepted`,
    },
    {
      key: "avoided",
      label: "Eng cost avoided",
      value: `$${roi.engCostSavedUsd.toLocaleString()}`,
      hint: `At $${roi.blendedHourlyUsd}/hr blended`,
    },
    {
      key: "ai-cost",
      label: "AI cost (seats + tokens)",
      value: `$${roi.tokenSpendUsd.toFixed(2)}`,
      hint: "Seats pro-rated + token spend",
    },
  ];

  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-5",
        className,
      )}
      data-slot="ai-kpi-strip"
    >
      {items.map((item) => (
        <div
          key={item.key}
          className="rounded-[var(--radius-card)] border border-border bg-pure-white px-[18px] py-[15px] shadow-[var(--shadow)]"
        >
          <p className="text-[11px] font-medium text-muted">{item.label}</p>
          <p
            className={cn(
              "mt-[5px] text-[24px] font-semibold leading-[32px] tracking-[-0.7px]",
              item.tone === "success"
                ? "text-success"
                : item.tone === "error"
                  ? "text-error"
                  : "text-ink",
            )}
          >
            {item.value}
          </p>
          <p className="mt-1 text-[11px] leading-[15px] text-faint">{item.hint}</p>
        </div>
      ))}
    </div>
  );
}
