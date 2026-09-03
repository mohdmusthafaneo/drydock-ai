import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadStandard } from "@/lib/drydock/standard";
import { StandardView } from "@/components/drydock/standard-view";

export default async function StandardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { patterns } = await loadStandard(session.organizationId);
  return <StandardView patterns={patterns} />;
}
