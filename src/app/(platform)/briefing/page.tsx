import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { MOCK_BRIEFING } from "@/lib/drydock/mock-data";
import { BriefingView } from "@/components/drydock/briefing-view";

export default async function BriefingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Mock briefing until ingest + detectors land. organizationId reserved for tenancy.
  void session.organizationId;

  return <BriefingView briefing={MOCK_BRIEFING} />;
}
