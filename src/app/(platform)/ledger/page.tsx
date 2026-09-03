import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadLedger } from "@/lib/drydock/loaders";
import { LedgerView } from "@/components/drydock/ledger-view";

export default async function LedgerPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { ledger, source } = await loadLedger(session.organizationId);

  return <LedgerView ledger={ledger} dataSource={source} />;
}
