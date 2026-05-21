import { DiscoveryWizard } from "@/components/discovery/discovery-wizard";

export default function GovernanceSetupPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Governance setup</h1>
        <p className="mt-1 text-slate-400">
          Configure org maturity, compliance, tooling, and delivery policies. This generates
          your Delivery DNA and unlocks release governance.
        </p>
      </div>
      <DiscoveryWizard />
    </div>
  );
}
