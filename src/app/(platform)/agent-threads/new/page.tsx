import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CreateThreadForm } from "@/components/agent-chat/compose-box";

export default async function NewAgentThreadPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!dna) redirect("/governance/setup");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/agent-threads"
          className="text-sm font-medium text-ink underline-offset-4 hover:underline"
        >
          ← Agent threads
        </Link>
        <h1 className="mt-2 font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink sm:text-[32px]">
          New agent thread
        </h1>
        <p className="mt-1 text-ash">
          Opens a discrete operational thread. The Super Agent coordinates specialists
          and replies appear in a shared timeline.
        </p>
      </div>
      <CreateThreadForm />
    </div>
  );
}
