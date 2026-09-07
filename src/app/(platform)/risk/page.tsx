import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";

/** Risk is not in section tabs yet — keep a clear landing if linked directly. */
export default function RiskPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk"
        description="Release risk signals are not available in this demo build yet. Use Delivery, Code, QA, and Compliance for evidence today."
      />
      <div className="rounded-[12px] border border-border bg-pure-white px-6 py-8 text-sm text-muted shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        <p>This surface is intentionally hidden from the top nav until it has live data.</p>
        <p className="mt-4">
          <Link href="/dashboard" className="font-medium text-accent hover:underline">
            ← Back to Overview
          </Link>
        </p>
      </div>
    </div>
  );
}
