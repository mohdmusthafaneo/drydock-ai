import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadBriefing } from "@/lib/drydock/loaders";
import { BriefingView } from "@/components/drydock/briefing-view";

export default async function BriefingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { briefing, source } = await loadBriefing(session.organizationId);

  return <BriefingView briefing={briefing} dataSource={source} />;
}
