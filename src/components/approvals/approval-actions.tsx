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

  async function decide(decision: "APPROVED" | "REJECTED" | "MODIFIED") {
    setLoading(true);
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ approvalId, decision, comment }),
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/8 bg-[#131A2A]/40 p-4">
      <p className="text-sm font-medium">{title}</p>
      <Textarea
        placeholder="Optional comment for audit log…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={loading} onClick={() => decide("APPROVED")}>
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={loading}
          onClick={() => decide("MODIFIED")}
        >
          Modify
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={loading}
          onClick={() => decide("REJECTED")}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
