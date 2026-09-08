import { StandardFromStore } from "@/components/drydock/standard-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function StandardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <StandardFromStore />;
}
