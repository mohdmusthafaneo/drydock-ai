import Link from "next/link";
import { cn } from "@/lib/utils";

type AuthorItem = { login: string; aiLinesPct: number; commits: number };

type Props = {
  items: AuthorItem[];
  className?: string;
};

export function BriefingContributors({ items, className }: Props) {
  const visible = items.filter((a) => a.commits > 0).slice(0, 4);
  const totalCommits = visible.reduce((n, a) => n + a.commits, 0);
  const top = visible[0];

  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-[18px] leading-snug tracking-[-0.14px] text-ink">
            Engineering activity
          </h3>
          <p className="mt-1 text-[13px] text-graphite">GitHub · last 7 days</p>
        </div>
        {visible.length > 0 && (
          <div className="text-right">
            <p className="font-display text-[28px] leading-none tracking-[-0.42px] tabular-nums text-ink">
              {visible.length}
            </p>
            <p className="mt-1 text-[11px] text-graphite">
              contributor{visible.length === 1 ? "" : "s"}
            </p>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 flex-1 text-[14px] text-ash">No commits in the selected period.</p>
      ) : (
        <>
          {top && (
            <p className="mt-4 text-[14px] leading-relaxed text-ash">
              <span className="font-medium text-ink">{top.login}</span> led with{" "}
              <span className="font-medium text-ink">{top.commits}</span> of{" "}
              <span className="font-medium text-ink">{totalCommits}</span> commits
              {visible.length > 1 ? ` across ${visible.length} contributors` : ""}.
            </p>
          )}

          <ul className="mt-3 space-y-2">
            {visible.map((item) => {
              const share = totalCommits > 0 ? Math.round((item.commits / totalCommits) * 100) : 0;
              return (
                <li key={item.login}>
                  <div className="mb-1 flex justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium text-ink">{item.login}</span>
                    <span className="shrink-0 tabular-nums text-graphite">
                      {item.commits} · {share}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-metric-track">
                    <div
                      className="h-full rounded-full bg-ink/70"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Link
        href="/code-analysis"
        className="mt-4 inline-flex items-center gap-1 text-[15px] font-medium text-ink transition-colors hover:text-rust"
      >
        Open code analysis →
      </Link>
    </div>
  );
}
