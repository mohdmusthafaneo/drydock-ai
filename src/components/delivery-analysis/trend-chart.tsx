"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeliveryAnalysisTrendPoint } from "@/lib/delivery-analysis/types";
import { TrendingUp } from "lucide-react";

type Props = {
  trend: DeliveryAnalysisTrendPoint[];
  hasHistory: boolean;
};

export function TrendChart({ trend, hasHistory }: Props) {
  if (!hasHistory || trend.length < 2) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base">Health trend</CardTitle>
          <CardDescription>Delivery health and open work over sync history</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-elevated/30 p-6 text-center">
            <TrendingUp className="h-8 w-8 text-muted" />
            <p className="text-sm text-secondary">Sync at least twice to see trends</p>
            <p className="text-xs text-muted">History tracking ships in a later phase</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxScore = 100;
  const maxOpen = Math.max(...trend.map((t) => t.openWork), 1);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Health trend</CardTitle>
        <CardDescription>Demo trend from mock sync history</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 sm:gap-3" style={{ minHeight: 160 }}>
          {trend.map((point) => {
            const scoreHeight = (point.healthScore / maxScore) * 100;
            const openHeight = (point.openWork / maxOpen) * 100;
            const label = new Date(point.syncedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            return (
              <div key={point.syncedAt} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div className="flex w-full max-w-[48px] items-end gap-0.5" style={{ height: 140 }}>
                  <div
                    className="flex-1 rounded-t bg-enterprise/80"
                    style={{ height: `${scoreHeight}%` }}
                    title={`Health: ${point.healthScore}`}
                  />
                  <div
                    className="flex-1 rounded-t bg-brand/60"
                    style={{ height: `${openHeight}%` }}
                    title={`Open work: ${point.openWork}`}
                  />
                </div>
                <span className="max-w-full truncate text-[10px] text-muted">{label}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-enterprise/80" />
            Health score
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-brand/60" />
            Open work
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
