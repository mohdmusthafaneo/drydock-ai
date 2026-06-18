import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { NewReleaseForm } from "@/components/releases/new-release-form";
import { PageHeader } from "@/components/layout/page-header";

export default async function NewReleasePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const dna = await prisma.deliveryDNA.findUnique({
    where: { organizationId: session.organizationId },
  });
  if (!dna) redirect("/governance/setup");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/releases"
        className="inline-block text-[15px] font-medium text-ink hover:text-rust"
      >
        ← Releases
      </Link>
      <PageHeader
        title="Register release event"
        description="AI will correlate telemetry and QA signals after you run assessment."
        className="pb-4"
      />
      <NewReleaseForm />
    </div>
  );
}
