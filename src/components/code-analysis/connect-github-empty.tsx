import Link from "next/link";
import { GitBranch, Plug } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ConnectGitHubEmpty() {
  return (
    <Card className="border-dashed border-chart-blue/30">
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-wash">
          <GitBranch className="h-6 w-6 text-chart-blue" />
        </div>
        <CardTitle className="mt-4">Connect GitHub to analyze delivery</CardTitle>
        <CardDescription className="mx-auto max-w-md">
          Code analysis pulls commits, pull requests, and review metadata from your connected
          repositories. Connect GitHub on the integrations page to see AI-assisted delivery metrics.
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
          your repositories.
        </p>
      </CardContent>
    </Card>
  );
}
