"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppData } from "@/lib/store";

export function ReportsFromStore() {
  const reports = useAppData((s) => s.data.reports);

  if (!reports.available) {
    return (
      <div className="space-y-[13px]">
        <PageHeader
          title="Reports"
          description="Exportable release and evidence reports are not available yet."
        />
        <div className="rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-8 text-sm text-muted shadow-[var(--shadow)]">
          <p>No report sections in the current evidence set.</p>
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
      <PageHeader title={reports.title} description={reports.description} />

      <div className="space-y-4">
        {reports.sections.map((section) => (
          <Card key={section.id}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
              <CardDescription>Demo report section</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-[14px] leading-relaxed text-secondary">{section.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted">
        <Link href="/dashboard" className="font-medium text-brown hover:underline">
          ← Back to Overview
        </Link>
      </p>
    </div>
  );
}
