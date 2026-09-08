"use client";

import { LedgerView } from "@/components/drydock/ledger-view";
import { useAppData } from "@/lib/store";

export function LedgerFromStore() {
  const ledger = useAppData((s) => s.data.ledger);
  const mode = useAppData((s) => s.data.meta.mode);
  const dataSource = mode === "live" ? "db" : "mock";

  return <LedgerView ledger={ledger} dataSource={dataSource} />;
}
