"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fieldClassName =
  "mt-1 w-full rounded-2xl border border-border bg-input px-3 py-2 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function IncidentRemediationForm({
  incidentId,
  currentStatus,
}: {
  incidentId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/incidents/${incidentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ status, remediationNotes: notes || undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label className="text-muted">Status</Label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={fieldClassName}
        >
          <option value="OPEN">Open</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="REMEDIATED">Remediated</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>
      <div>
        <Label className="text-muted">Remediation notes</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={cn(fieldClassName, "min-h-[80px]")}
          placeholder="Rollback executed, root cause documented…"
        />
      </div>
      {error && <p className="text-sm text-error">{error}</p>}
      <Button type="submit" disabled={loading} variant="ink" size="lg">
        {loading ? "Saving…" : "Update incident"}
      </Button>
    </form>
  );
}
