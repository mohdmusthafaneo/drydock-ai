import Link from "next/link";
import { Activity, Plug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ConnectPrometheusEmpty() {
  return (
    <Card className="border-dashed border-brand/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
          <Activity className="h-6 w-6 text-brand" />
        </div>
        <CardTitle className="mt-4">Connect Prometheus to analyze operational health</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Observability intelligence pulls error rates, latency, resource pressure, and alert
          signals from your Prometheus instance. Connect on the integrations page to see portfolio
          reliability.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 pb-8">
        <Button asChild variant="brand">
          <Link href="/integrations">
            <Plug className="h-4 w-4" />
            Go to integrations
          </Link>
        </Button>
        <p className="max-w-sm text-center text-xs text-muted">
          Read-only PromQL queries. AIDOS observes operational health for governance — it does not
          write to Prometheus.
        </p>
      </CardContent>
    </Card>
  );
}

export function SelectScopesEmpty() {
  return (
    <Card className="border-dashed border-warning/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <Activity className="h-6 w-6 text-warning" />
        </div>
        <CardTitle className="mt-4">Select services to analyze</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Prometheus is connected but no services or namespaces are selected. Choose which workloads
          to include in operational analysis on the integrations page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 pb-8">
        <Button asChild variant="brand">
          <Link href="/integrations">
            <Plug className="h-4 w-4" />
            Select services
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

type SyncPrometheusEmptyProps = {
  serviceScopes: Array<{ id: string; label: string }>;
};

export function SyncPrometheusEmpty({ serviceScopes }: SyncPrometheusEmptyProps) {
  const labels = serviceScopes.map((s) => s.label).join(", ");
  return (
    <Card className="border-dashed border-brand/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
          <Activity className="h-6 w-6 text-brand" />
        </div>
        <CardTitle className="mt-4">Sync Prometheus data</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Your first sync runs PromQL templates for {serviceScopes.length} selected service
          {serviceScopes.length === 1 ? "" : "s"} ({labels}).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 pb-8">
        <Button asChild variant="brand">
          <Link href="/integrations">
            <Plug className="h-4 w-4" />
            Sync on integrations
          </Link>
        </Button>
        <p className="max-w-sm text-center text-xs text-muted">
          Metrics are query-based at sync time — not live Prometheus.
        </p>
      </CardContent>
    </Card>
  );
}
