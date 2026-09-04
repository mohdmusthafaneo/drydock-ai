import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConnectDonePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const provider = firstParam(sp.provider);
  const org = firstParam(sp.org) ?? "your organization";
  const site = firstParam(sp.site);
  const displayName = firstParam(sp.displayName);
  const installationId = firstParam(sp.installation_id);

  const isJira = provider === "jira";
  const headline = isJira
    ? `Jira connected to ${org}`
    : `GitHub App installed for ${org}`;

  return (
    <Card className="border-success/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-success" />
          <CardTitle className="text-lg">{headline}</CardTitle>
        </div>
        <CardDescription>Connection completed successfully.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 rounded-lg border border-border bg-elevated/40 p-3 text-sm">
          {isJira && site && (
            <p className="text-secondary">
              Site: <span className="font-medium text-primary">{site}</span>
            </p>
          )}
          {isJira && displayName && (
            <p className="text-secondary">
              Connected as <span className="font-medium text-primary">{displayName}</span>
            </p>
          )}
          {!isJira && installationId && (
            <p className="text-secondary">
              Installation{" "}
              <Badge variant="brand" className="font-mono">
                #{installationId}
              </Badge>
            </p>
          )}
        </div>

        <p className="text-sm text-muted">
          You can close this window. Your DryDock administrator will finish project and repository
          setup in DryDock.
        </p>
      </CardContent>
    </Card>
  );
}
