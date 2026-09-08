import { ReportsFromStore } from "@/components/reports/reports-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ReportsFromStore />;
}
