import Link from "next/link";
import { Bell, Plug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ConnectGrafanaEmpty() {
  return (
    <Card className="border-dashed border-brand/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
          <Bell className="h-6 w-6 text-brand" />
        </div>
        <CardTitle className="mt-4">Connect Grafana for alerts and dashboard coverage</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Grafana intelligence surfaces firing alerts, dashboard health, and annotation density —
          so leaders can govern observability coverage without dashboard hopping.
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
          Read-only Grafana API access. AIDOS observes alert state and dashboard coverage — it does
          not write to Grafana.
        </p>
      </CardContent>
    </Card>
  );
}

export function SelectGrafanaScopesEmpty() {
  return (
    <Card className="border-dashed border-warning/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <Bell className="h-6 w-6 text-warning" />
        </div>
        <CardTitle className="mt-4">Select dashboards to analyze</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Grafana is connected but no dashboards or folders are selected. Choose which dashboards
          to include in operational analysis on the integrations page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 pb-8">
        <Button asChild variant="brand">
          <Link href="/integrations">
            <Plug className="h-4 w-4" />
            Select dashboards
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

type SyncGrafanaEmptyProps = {
  dashboardScopes: Array<{ title: string }>;
};

export function SyncGrafanaEmpty({ dashboardScopes }: SyncGrafanaEmptyProps) {
  const labels = dashboardScopes.map((s) => s.title).join(", ");
  return (
    <Card className="border-dashed border-brand/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
          <Bell className="h-6 w-6 text-brand" />
        </div>
        <CardTitle className="mt-4">Sync Grafana data</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Your first sync fetches alerts, annotations, and dashboard health for{" "}
          {dashboardScopes.length} selected scope
          {dashboardScopes.length === 1 ? "" : "s"} ({labels}).
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
          Alert and dashboard data are fetched at sync time — configure webhooks for real-time
          incidents.
        </p>
      </CardContent>
    </Card>
  );
}

export function ConnectObservabilityEmpty() {
  return (
    <Card className="border-dashed border-brand/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
          <Bell className="h-6 w-6 text-brand" />
        </div>
        <CardTitle className="mt-4">Connect Prometheus and/or Grafana</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Observability intelligence pulls metric KPIs from Prometheus and alert/dashboard coverage
          from Grafana. Connect one or both on the integrations page.
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
          Prometheus and Grafana are independent sources — AIDOS never merges them into a single
          synthetic series.
        </p>
      </CardContent>
    </Card>
  );
}
