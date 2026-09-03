import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { NewReleaseForm } from "@/components/releases/new-release-form";
import { PageHeader } from "@/components/layout/page-header";

export default async function NewReleasePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Link
        href="/releases"
        className="inline-block text-[15px] font-medium text-ink hover:text-rust"
      >
        ← Releases
      </Link>
      <PageHeader
        title="Register release"
        description="The Certificate attaches to this release. DryDock does not write to GitHub or Jira."
        className="pb-4"
      />
      <NewReleaseForm />
    </div>
  );
}
