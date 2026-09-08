import { SettingsFromStore } from "@/components/settings/settings-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <SettingsFromStore />;
}
