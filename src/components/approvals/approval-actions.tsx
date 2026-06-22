"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function ApprovalActions({
  approvalId,
  title,
}: {
  approvalId: string;
  title: string;
}) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "APPROVED" | "REJECTED" | "MODIFIED") {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ approvalId, decision, comment }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to submit decision");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-elevated p-4">
      <p className="text-sm font-medium text-primary">{title}</p>
      <Textarea
        placeholder="Optional comment for audit log…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />
      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <Button size="sm" variant="ink" disabled={loading} onClick={() => decide("APPROVED")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="link"
          className="h-auto px-0 text-error"
          disabled={loading}
          onClick={() => decide("REJECTED")}
        >
          Reject
        </Button>
        <Button
          size="sm"
          variant="link"
          className="h-auto px-0"
          disabled={loading}
          onClick={() => decide("MODIFIED")}
        >
          Request modification
        </Button>
      </div>
    </div>
  );
}
