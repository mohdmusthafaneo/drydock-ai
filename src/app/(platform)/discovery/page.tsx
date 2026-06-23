import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DiscoveryRedirectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const from = firstParam(sp.from);
  const query = from ? `?from=${encodeURIComponent(from)}` : "";

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId: session.organizationId },
    select: { id: true },
  });

  if (dna) {
    redirect(`/governance${query}`);
  }

  redirect(`/governance/setup${query}`);
}
