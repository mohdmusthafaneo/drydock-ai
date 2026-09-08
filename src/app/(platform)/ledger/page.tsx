import { LedgerFromStore } from "@/components/drydock/ledger-from-store";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LedgerPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <LedgerFromStore />;
}
