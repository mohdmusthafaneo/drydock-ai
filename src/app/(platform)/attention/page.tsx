import { AttentionPageClient } from "@/components/attention/attention-page-client";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AttentionQueuePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <AttentionPageClient />;
}
