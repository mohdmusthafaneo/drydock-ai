import { ReleaseDetailFromStore } from "@/components/releases/release-detail-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ReleaseDetailPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ReleaseDetailFromStore />;
}
