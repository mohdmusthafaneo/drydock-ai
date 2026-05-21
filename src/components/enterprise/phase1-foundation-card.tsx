import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Check = { id: string; label: string; done: boolean; href?: string };

export function Phase1FoundationCard({ checks }: { checks: Check[] }) {
  const done = checks.filter((c) => c.done).length;
  const pct = Math.round((done / checks.length) * 100);

  return (
    <Card className="border-brand/20 bg-brand-muted/30">
      <CardHeader>
        <CardTitle className="text-base">Phase 1 foundation</CardTitle>
        <CardDescription>
          Enterprise shell — governance & observability (no autonomous agents yet). {done}/
          {checks.length} complete ({pct}%)
        </CardDescription>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.id}>
              {c.href ? (
                <Link
                  href={c.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-hover",
                    c.done ? "text-success" : "text-secondary",
                  )}
                >
                  {c.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  {c.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 text-sm",
                    c.done ? "text-success" : "text-secondary",
                  )}
                >
                  {c.done ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted" />
                  )}
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
