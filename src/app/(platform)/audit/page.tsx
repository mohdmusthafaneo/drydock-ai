import { AuditFromStore } from "@/components/audit/audit-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AuditLogsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AuditFromStore />;
}
