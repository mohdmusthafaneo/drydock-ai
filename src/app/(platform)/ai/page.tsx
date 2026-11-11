import { redirect } from "next/navigation";
import { AiDashboardFromStore } from "@/components/ai/ai-dashboard-from-store";
import { getSession } from "@/lib/session";

export default async function AiPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AiDashboardFromStore />;
}
