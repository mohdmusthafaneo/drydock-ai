import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DeliveryAnalysisFromStore } from "@/components/delivery-analysis/delivery-analysis-from-store";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DeliveryAnalysisPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const sp = await searchParams;
  return <DeliveryAnalysisFromStore from={sp.from} />;
}
