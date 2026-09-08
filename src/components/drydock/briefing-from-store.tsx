"use client";

import { BriefingView } from "@/components/drydock/briefing-view";
import { useAppData } from "@/lib/store";

export function BriefingFromStore() {
  const briefing = useAppData((s) => s.data.briefing);
  const mode = useAppData((s) => s.data.meta.mode);
  const dataSource = mode === "live" ? "db" : "mock";

  return <BriefingView briefing={briefing} dataSource={dataSource} />;
}
