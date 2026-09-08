"use client";

import { StandardView } from "@/components/drydock/standard-view";
import { useAppData } from "@/lib/store";

export function StandardFromStore() {
  const patterns = useAppData((s) => s.data.standard.patterns);

  return <StandardView patterns={patterns} />;
}
