"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { withOverviewContext } from "@/lib/overview/nav-context";
import {
  useAppData,
  useFilters,
  type AttentionQueueItem,
} from "@/lib/store";
import { cn } from "@/lib/utils";

const TONE: Record<AttentionQueueItem["tone"], string> = {
  danger: "border-[#ffe0d1] bg-[#fff0e8]",
  warning: "border-[#ffe8b8] bg-[#fff8df]",
  info: "border-border bg-pure-white",
};

export function AttentionPageClient() {
  const items = useAppData((s) => s.data.attention.items);
  const { team, sprint } = useFilters();

  return (
    <div className="space-y-[13px]">
      <PageHeader
        title="Attention queue"
        description="Every item that needs attention — with its reason and originating Overview decision. Nothing is silently suppressed."
      />

      <Card>
        <CardHeader>
          <CardTitle>Items needing attention</CardTitle>
          <CardDescription>
            {items.length} item{items.length === 1 ? "" : "s"} in the current evidence set
            {team ? ` · team ${team}` : ""}
            {sprint ? ` · sprint ${sprint}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => {
            const href = withOverviewContext(item.href, { team, sprint });
            return (
              <Link
                key={item.id}
                href={href}
                className={cn(
                  "block rounded-[var(--radius-card)] border px-5 py-4 transition-colors hover:bg-hover",
                  TONE[item.tone],
                )}
              >
                <p className="text-[15px] font-semibold text-ink">{item.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{item.reason}</p>
                <p className="mt-2 text-[11px] text-muted">{item.originatingDecision}</p>
                <p className="mt-3 text-[12px] font-semibold text-brown">Open evidence →</p>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
