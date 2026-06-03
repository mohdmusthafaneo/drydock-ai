import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function RepoBreakdown({
  items,
  onSelectRepo,
  selectedRepo,
}: {
  items: { repo: string; aiLinesPct: number; totalLines: number }[];
  onSelectRepo?: (repo: string) => void;
  selectedRepo?: string | null;
}) {
  const maxLines = Math.max(...items.map((i) => i.totalLines), 1);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">By repository</CardTitle>
        <CardDescription>AI-attributed lines vs total additions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted">No data for selected filters.</p>
        ) : (
          items.map((item) => (
            <button
              key={item.repo}
              type="button"
              onClick={() => onSelectRepo?.(item.repo)}
              className={cn(
                "w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover",
                selectedRepo === item.repo && "bg-enterprise-muted/40 ring-1 ring-enterprise/30",
              )}
            >
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate font-medium text-primary">{item.repo}</span>
                <span className="shrink-0 tabular-nums text-secondary">
                  {item.aiLinesPct}% · {item.totalLines.toLocaleString()} lines
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-metric-track">
                <div
                  className="h-full rounded-full bg-enterprise transition-all"
                  style={{ width: `${(item.aiLinesPct / 100) * (item.totalLines / maxLines) * 100}%` }}
                />
                <div
                  className="-mt-2 h-full rounded-full bg-mvp/80 transition-all"
                  style={{
                    width: `${Math.min(100, (item.totalLines / maxLines) * 100)}%`,
                    opacity: 0.35,
                  }}
                />
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function AuthorBreakdown({
  items,
  onSelectAuthor,
  selectedAuthor,
}: {
  items: { login: string; aiLinesPct: number; commits: number }[];
  onSelectAuthor?: (login: string) => void;
  selectedAuthor?: string | null;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">By author</CardTitle>
        <CardDescription>Top contributors in selected period</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="pb-2 font-medium">Author</th>
                <th className="pb-2 font-medium">Commits</th>
                <th className="pb-2 text-right font-medium">AI lines</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-muted">
                    No data for selected filters.
                  </td>
                </tr>
              ) : (
                items.slice(0, 8).map((item) => (
                  <tr
                    key={item.login}
                    className={cn(
                      "border-b border-border-subtle last:border-0",
                      onSelectAuthor && "cursor-pointer hover:bg-hover",
                      selectedAuthor === item.login && "bg-enterprise-muted/30",
                    )}
                    onClick={() => onSelectAuthor?.(item.login)}
                  >
                    <td className="py-2 font-medium text-primary">{item.login}</td>
                    <td className="py-2 tabular-nums text-secondary">{item.commits}</td>
                    <td className="py-2 text-right tabular-nums">
                      <span
                        className={cn(
                          item.aiLinesPct >= 60 && "text-mvp",
                          item.aiLinesPct >= 30 && item.aiLinesPct < 60 && "text-enterprise",
                          item.aiLinesPct < 30 && "text-secondary",
                        )}
                      >
                        {item.aiLinesPct}%
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
