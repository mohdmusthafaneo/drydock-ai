import Link from "next/link";
import { Kanban, Plug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ConnectJiraEmpty() {
  return (
    <Card className="border-dashed border-brand/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
          <Kanban className="h-6 w-6 text-brand" />
        </div>
        <CardTitle className="mt-4">Connect Jira to analyze delivery</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Delivery analysis pulls fix versions, issue counts, and sprint progress from your
          connected Jira projects. Connect Jira on the integrations page to see portfolio health.
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
          Read-only access. AIDOS observes delivery patterns for governance — it does not write to
          Jira.
        </p>
      </CardContent>
    </Card>
  );
}

export function SelectProjectsEmpty() {
  return (
    <Card className="border-dashed border-warning/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
          <Kanban className="h-6 w-6 text-warning" />
        </div>
        <CardTitle className="mt-4">Select Jira projects to analyze</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Jira is connected but no projects are selected. Choose which projects to include in
          delivery analysis on the integrations page.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 pb-8">
        <Button asChild variant="brand">
          <Link href="/integrations">
            <Plug className="h-4 w-4" />
            Select projects
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

type SyncJiraEmptyProps = {
  projectKeys: string[];
};

export function SyncJiraEmpty({ projectKeys }: SyncJiraEmptyProps) {
  return (
    <Card className="border-dashed border-brand/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-muted">
          <Kanban className="h-6 w-6 text-brand" />
        </div>
        <CardTitle className="mt-4">Sync Jira data</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Your first sync pulls fix versions, issue counts, and active sprint progress for{" "}
          {projectKeys.length} selected project{projectKeys.length === 1 ? "" : "s"} (
          {projectKeys.join(", ")}).
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
          Counts are JQL-based at sync time — not live Jira.
        </p>
      </CardContent>
    </Card>
  );
}
