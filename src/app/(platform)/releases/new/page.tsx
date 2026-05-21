import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NewReleaseForm } from "@/components/releases/new-release-form";

export default async function NewReleasePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!dna) redirect("/governance/setup");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/releases" className="text-sm text-[#93b4ff] hover:underline">
          ← Releases
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Register release event</h1>
        <p className="mt-1 text-slate-400">
          AI will correlate telemetry and QA signals after you run assessment.
        </p>
      </div>
      <NewReleaseForm />
    </div>
  );
}
