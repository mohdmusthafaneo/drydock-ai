"use client";

import { LedgerView } from "@/components/drydock/ledger-view";
import { useAppData } from "@/lib/store";

export function LedgerFromStore() {
  const ledger = useAppData((s) => s.data.ledger);
  return <LedgerView ledger={ledger} />;
}
