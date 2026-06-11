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
        <Link href="/agent-threads" className="text-sm text-[#93b4ff] hover:underline">
          ← Agent threads
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New agent thread</h1>
        <p className="mt-1 text-slate-400">
          Opens a discrete operational thread. The Super Agent coordinates specialists
          and replies appear in a shared timeline.
        </p>
      </div>
      <CreateThreadForm />
    </div>
  );
}
