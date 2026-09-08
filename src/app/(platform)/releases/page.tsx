import { ReleasesListFromStore } from "@/components/releases/releases-list-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function ReleasesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <ReleasesListFromStore />;
}
