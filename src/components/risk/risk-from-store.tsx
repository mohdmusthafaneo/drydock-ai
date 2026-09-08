"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppData } from "@/lib/store";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES = {
  high: "border-[#ffe0d1] bg-[#fff0e8] text-coral",
  medium: "border-[#ffe8b8] bg-[#fff8df] text-brown",
  low: "border-border bg-elevated text-muted",
} as const;

export function RiskFromStore() {
  const risk = useAppData((s) => s.data.risk);

  if (!risk.available) {
    return (
      <div className="space-y-[13px]">
        <PageHeader
          title="Risk"
          description="Release risk signals are not available yet. Use Delivery, Code, QA, and Compliance for evidence today."
        />
        <div className="rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-8 text-sm text-muted shadow-[var(--shadow)]">
          <p>No risk items in the current evidence set.</p>
          <p className="mt-4">
            <Link href="/dashboard" className="font-medium text-brown hover:underline">
              ← Back to Overview
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-[13px]">
      <PageHeader title={risk.title} description={risk.description} />

      <div className="space-y-3">
        {risk.items.map((item) => {
          const body = (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{item.title}</CardTitle>
                <span
                  className={cn(
                    "inline-flex rounded-[8px] border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide",
                    SEVERITY_STYLES[item.severity],
                  )}
                >
                  {item.severity}
                </span>
              </div>
              <CardDescription className="mt-2 text-[14px] leading-relaxed text-secondary">
                {item.summary}
              </CardDescription>
              {item.href ? (
                <p className="mt-3 text-[12px] font-semibold text-brown">Open evidence →</p>
              ) : null}
            </>
          );

          return (
            <Card key={item.id}>
              <CardHeader>
                {item.href ? (
                  <Link href={item.href} className="block hover:opacity-90">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <p className="text-sm text-muted">
        <Link href="/dashboard" className="font-medium text-brown hover:underline">
          ← Back to Overview
        </Link>
      </p>
    </div>
  );
}
