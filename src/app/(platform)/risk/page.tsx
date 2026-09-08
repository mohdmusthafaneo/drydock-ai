import { RiskFromStore } from "@/components/risk/risk-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function RiskPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <RiskFromStore />;
}
