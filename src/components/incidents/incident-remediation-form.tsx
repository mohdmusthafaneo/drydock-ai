"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="text-xs text-slate-500">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
        >
          <option value="OPEN">Open</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="REMEDIATED">Remediated</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-slate-500">Remediation notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
          placeholder="Rollback executed, root cause documented…"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={loading} size="sm">
        {loading ? "Saving…" : "Update incident"}
      </Button>
    </form>
  );
}
