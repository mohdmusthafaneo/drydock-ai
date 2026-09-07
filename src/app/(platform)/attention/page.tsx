import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OVERVIEW_ATTENTION_FIXTURE } from "@/lib/overview/approvals-fixture";
import { shouldUseOverviewFixture } from "@/lib/overview/fixture";
import { withOverviewContext } from "@/lib/overview/nav-context";
import { getSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const TONE: Record<(typeof OVERVIEW_ATTENTION_FIXTURE)[number]["tone"], string> = {
  danger: "border-[#ffe0d1] bg-[#fff0e8]",
  warning: "border-[#ffe8b8] bg-[#fff8df]",
  info: "border-border bg-pure-white",
};

export default async function AttentionQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const team = firstParam(sp.team) ?? null;
  const sprint = firstParam(sp.sprint) ?? null;
  const useFixture = shouldUseOverviewFixture(firstParam(sp.fixture));

  const items = useFixture
    ? OVERVIEW_ATTENTION_FIXTURE
    : OVERVIEW_ATTENTION_FIXTURE.map((item) => ({
        ...item,
        title: item.title,
      }));

  return (
    <div className="space-y-[13px]">
      <PageHeader
        title="Attention queue"
        description="Every item that needs attention — with its reason and originating Overview decision. Nothing is silently suppressed."
      />

      <Card>
        <CardHeader>
          <CardTitle>Items needing attention</CardTitle>
          <CardDescription>
            {items.length} item{items.length === 1 ? "" : "s"} in the current evidence set
            {team ? ` · team ${team}` : ""}
            {sprint ? ` · sprint ${sprint}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => {
            const href = withOverviewContext(item.href, { team, sprint });
            return (
              <Link
                key={item.id}
                href={href}
                className={cn(
                  "block rounded-[var(--radius-card)] border px-5 py-4 transition-colors hover:bg-hover",
                  TONE[item.tone],
                )}
              >
                <p className="text-[15px] font-semibold text-ink">{item.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-secondary">{item.reason}</p>
                <p className="mt-2 text-[11px] text-muted">{item.originatingDecision}</p>
                <p className="mt-3 text-[12px] font-semibold text-brown">Open evidence →</p>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
