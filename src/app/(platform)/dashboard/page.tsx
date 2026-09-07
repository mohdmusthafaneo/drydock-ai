import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { getOverviewFixture } from "@/lib/overview/fixture";
import { loadOverviewDashboard } from "@/lib/overview/load-overview";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function OverviewDashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const team = firstParam(sp.team) ?? null;
  const sprint = firstParam(sp.sprint) ?? null;
  const fixtureFlag = firstParam(sp.fixture);
  // Dev defaults to designer dummy data; pass fixture=0 to use live loaders.
  const useFixture =
    process.env.NODE_ENV !== "production" && fixtureFlag !== "0";

  const greetingName = session.name.split(/\s+/)[0] || session.name;

  const model = useFixture
    ? getOverviewFixture({ greetingName, teamKey: team })
    : await loadOverviewDashboard({
        organizationId: session.organizationId,
        userName: session.name,
        teamKey: team,
        sprintId: sprint,
        useFixture: false,
      });

  return <OverviewDashboard model={model} />;
}
