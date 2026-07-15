import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/rbac";

export default async function NewAgentThreadPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!hasPermission(session, "agents", "view")) {
    redirect("/dashboard");
  }

  redirect("/agent-threads");
}
