"use client";

import { BriefingView } from "@/components/drydock/briefing-view";
import { useAppData } from "@/lib/store";

export function BriefingFromStore() {
  const briefing = useAppData((s) => s.data.briefing);
  return <BriefingView briefing={briefing} />;
}
