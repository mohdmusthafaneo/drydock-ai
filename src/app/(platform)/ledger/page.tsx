import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { MOCK_LEDGER } from "@/lib/drydock/mock-data";
import { LedgerView } from "@/components/drydock/ledger-view";

export default async function LedgerPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  void session.organizationId;

  return <LedgerView ledger={MOCK_LEDGER} />;
}
