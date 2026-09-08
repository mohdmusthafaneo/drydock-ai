import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { isObservabilityEnabled } from "@/lib/process-role";
import { ObservabilityFromStore } from "@/components/observability/observability-from-store";

export default async function ObservabilityPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isObservabilityEnabled()) redirect("/briefing");
  return <ObservabilityFromStore />;
}
