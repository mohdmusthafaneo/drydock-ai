import { BriefingFromStore } from "@/components/drydock/briefing-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function BriefingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <BriefingFromStore />;
}
