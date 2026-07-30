"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export { classifyDecisionHistoryItem } from "@/lib/approvals/presentation";

export type DecisionHistoryItem = {
  id: string;
  title: string;
  decision: string;
  comment: string | null;
  decidedAt: string | null;
  approverName: string | null;
  release: { id: string; name: string } | null;
  isSystemEvent: boolean;
};

function formatDecidedAt(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DecisionHistoryList({ items }: { items: DecisionHistoryItem[] }) {
  const [showSystemEvents, setShowSystemEvents] = useState(false);

  const visible = useMemo(
    () =>
      showSystemEvents
        ? items
        : items.filter((item) => !item.isSystemEvent),
    [items, showSystemEvents],
  );

  const hiddenSystemCount = items.length - items.filter((item) => !item.isSystemEvent).length;

  if (items.length === 0) {
    return <p className="text-sm text-muted">No decisions yet.</p>;
  }

  return (
    <div className="space-y-4">
      {hiddenSystemCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">
            Showing human sign-offs by default
            {!showSystemEvents ? ` · ${hiddenSystemCount} system event${hiddenSystemCount === 1 ? "" : "s"} hidden` : ""}
          </p>
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto px-0 text-xs"
            onClick={() => setShowSystemEvents((value) => !value)}
          >
            {showSystemEvents ? "Hide system events" : "Show system events"}
          </Button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-sm text-muted">No human decisions yet.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((approval) => {
            const decidedLabel = formatDecidedAt(approval.decidedAt);

            return (
              <div
                key={approval.id}
                className="rounded-xl border border-border-subtle bg-elevated px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-primary">{approval.title}</span>
                      {approval.isSystemEvent ? (
                        <Badge variant="muted">System</Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                      {approval.release && (
                        <Link
                          href={`/releases/${approval.release.id}`}
                          className="text-ink underline-offset-4 hover:underline"
                        >
                          {approval.release.name}
                        </Link>
                      )}
                      {decidedLabel && <span>Decided {decidedLabel}</span>}
                      {approval.approverName && <span>By {approval.approverName}</span>}
                    </div>
                    {approval.comment && (
                      <p className="text-xs text-secondary">&ldquo;{approval.comment}&rdquo;</p>
                    )}
                  </div>
                  <Badge variant={approval.decision === "APPROVED" ? "success" : "muted"}>
                    {approval.decision}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
