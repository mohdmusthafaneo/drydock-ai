import { GovernanceFromStore } from "@/components/governance/governance-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function GovernancePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <GovernanceFromStore />;
}
