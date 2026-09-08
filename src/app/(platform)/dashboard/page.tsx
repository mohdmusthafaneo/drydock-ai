import { OverviewDashboardFromStore } from "@/components/overview/overview-dashboard-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function OverviewDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <OverviewDashboardFromStore />;
}
