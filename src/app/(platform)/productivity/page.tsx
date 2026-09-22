import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ProductivityDashboard } from "@/components/productivity/productivity-dashboard";

export default async function ProductivityPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ProductivityDashboard />;
}
