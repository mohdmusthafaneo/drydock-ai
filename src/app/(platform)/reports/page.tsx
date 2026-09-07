import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";

/** Reports is not in section tabs yet — keep a clear landing if linked directly. */
export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Exportable release and evidence reports are not available in this demo build yet."
      />
      <div className="rounded-[12px] border border-border bg-pure-white px-6 py-8 text-sm text-muted shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <p>This surface is intentionally hidden from the top nav until export flows ship.</p>
        <p className="mt-4">
          <Link href="/dashboard" className="font-medium text-accent hover:underline">
            ← Back to Overview
          </Link>
        </p>
      </div>
    </div>
  );
}
