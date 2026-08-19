import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import type { IncidentCodeLinkView } from "@/lib/incident-code-correlation";
import { CORRELATION_WINDOW_MS } from "@/lib/incident-code-correlation";

const CORRELATION_WINDOW_HOURS = CORRELATION_WINDOW_MS / (1000 * 60 * 60);

type Props = {
  links: IncidentCodeLinkView[];
};

export function IncidentRelatedChanges({ links }: Props) {
  if (links.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Likely related changes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  No merged PRs correlated in the past {CORRELATION_WINDOW_HOURS}h before
                  this incident.
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  PRs merged more than {CORRELATION_WINDOW_HOURS}h before incident detection
                  are excluded from correlation analysis.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Likely related changes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {links.map((link) => (
          <div
            key={link.id}
            className="rounded-lg border border-border-subtle bg-elevated/30 p-3 text-sm"
          >
            {link.pr ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={link.pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ink underline-offset-4 hover:underline"
                  >
                    #{link.pr.number} · {link.pr.title}
                  </Link>
                  <Badge variant="muted">{Math.round(link.confidence * 100)}% match</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {link.pr.repo} · merged {new Date(link.pr.mergedAt).toLocaleString()} ·{" "}
                  {link.reason}
                </p>
                <p className="mt-2 text-xs text-secondary">
                  <span className="text-muted">Accountable: </span>
                  {link.people.length > 0
                    ? link.people.map((p) => `@${p}`).join(", ")
                    : `@${link.pr.author}`}
                </p>
              </>
            ) : (
              <p className="text-secondary">{link.reason}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
