import { DiscoveryWizard } from "@/components/discovery/discovery-wizard";
import { PageHeader } from "@/components/layout/page-header";

export default function GovernanceSetupPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Governance setup"
        description="Configure org maturity, compliance, tooling, and delivery policies. This generates your Delivery DNA and unlocks release governance."
      />
      <DiscoveryWizard embedded />
    </div>
  );
}
