import { PageHeader } from "@/components/layout/page-header";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Exportable release and evidence reports will land here — coming soon."
      />
      <div className="rounded-[12px] border border-border bg-pure-white px-6 py-10 text-sm text-muted shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        Coming soon
      </div>
    </div>
  );
}
