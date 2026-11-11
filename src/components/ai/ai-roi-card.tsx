import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CursorAiRoi } from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";

export function AiRoiCard({ roi }: { roi: CursorAiRoi }) {
  const positive = roi.netValueUsd >= 0;

  return (
    <Card data-slot="ai-roi-card">
      <CardHeader>
        <CardTitle>ROI this sprint</CardTitle>
        <CardDescription>
          Engineering time implied by accepted AI lines vs token spend
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-[11px] font-medium text-muted">Net value</p>
            <p
              className={cn(
                "mt-1 text-[28px] font-semibold tracking-[-0.75px]",
                positive ? "text-success" : "text-error",
              )}
            >
              {positive ? "+" : "−"}${Math.abs(roi.netValueUsd).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted">ROI multiple</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums text-ink">
              {roi.roiMultiple == null ? "—" : `${roi.roiMultiple}×`}
            </p>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <Stat
            label="Eng hours saved"
            value={`${roi.engHoursSaved.toLocaleString()}h`}
          />
          <Stat
            label="Eng cost avoided"
            value={`$${roi.engCostSavedUsd.toLocaleString()}`}
          />
          <Stat
            label="AI cost (seats + tokens)"
            value={`$${roi.tokenSpendUsd.toFixed(2)}`}
          />
        </div>

        <p className="text-[12px] leading-snug text-muted">
          {roi.caption} Based on {roi.aiLinesAccepted.toLocaleString()} AI-attributed
          lines at ${roi.blendedHourlyUsd}/hr.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[9px] border border-border-soft px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
