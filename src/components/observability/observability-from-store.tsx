"use client";

import { PageHeader } from "@/components/layout/page-header";
import { ObservabilityDashboard } from "@/components/observability/observability-dashboard";
import { useAppData } from "@/lib/store";

export function ObservabilityFromStore() {
  const snapshot = useAppData((s) => s.data.observability.snapshot);
  const scopes = useAppData((s) => s.data.observability.availableServiceScopes);

  return (
    <div className="w-full space-y-8 pb-24 lg:pb-8">
      <PageHeader
        title="Observability center"
        description="See error rates, latency, resource pressure, and alert signals — so leaders can govern operational health with evidence, not dashboard hopping."
      />

      {snapshot || scopes.length > 0 ? (
        <ObservabilityDashboard canSync={false} />
      ) : (
        <p className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-secondary">
          No observability evidence in the store yet. Connect Prometheus on Integrations.
        </p>
      )}
    </div>
  );
}
