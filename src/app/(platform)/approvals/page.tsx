import { ApprovalsFromStore } from "@/components/approvals/approvals-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ApprovalsFromStore />;
}
