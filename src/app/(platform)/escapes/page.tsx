import { EscapesFromStore } from "@/components/drydock/escapes-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function EscapesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <EscapesFromStore />;
}
