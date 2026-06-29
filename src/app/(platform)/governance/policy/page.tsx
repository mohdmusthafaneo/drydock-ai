import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isJiraOAuthConnected, parseJiraMeta } from "@/lib/jira-meta";
import {
  mergePolicyConfig,
  parseGovernancePolicy,
  SYSTEM_DEFAULT_POLICY,
} from "@/lib/governance/policy";
import { GovernancePolicyForm } from "@/components/governance/governance-policy-form";
import { PageHeader } from "@/components/layout/page-header";

export default async function GovernancePolicyPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [policyRow, jiraIntegration, dna] = await Promise.all([
    prisma.governancePolicy.findUnique({
      where: { organizationId: session.organizationId },
    }),
    prisma.integration.findFirst({
      where: { organizationId: session.organizationId, provider: "JIRA" },
    }),
    prisma.deliveryDNA.findUnique({ where: { organizationId: session.organizationId } }),
  ]);

  if (!dna) redirect("/governance/setup");

  const document = parseGovernancePolicy(policyRow);
  const baseline = mergePolicyConfig(SYSTEM_DEFAULT_POLICY, document);
  const jiraMeta =
    jiraIntegration && isJiraOAuthConnected(jiraIntegration)
      ? parseJiraMeta(jiraIntegration.metadataJson)
      : null;
  const projectKeys = jiraMeta?.projectKeys ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-24 lg:pb-8">
      <Link
        href="/governance"
        className="inline-block text-[15px] font-medium text-ink hover:text-rust"
      >
        ← Delivery DNA
      </Link>
      <PageHeader
        title="Governance policy"
        description="Configure organization-wide compliance and governance rules, with optional per-project overrides for synced Jira projects."
        className="pb-2"
      />

      <GovernancePolicyForm
        initialBaseline={baseline}
        initialProjectOverrides={document.projectOverrides ?? {}}
        projectKeys={projectKeys}
      />
    </div>
  );
}
