import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { AcceleratorFeature, JiraEpic, RoadmapPhase } from "@/lib/mvp-accelerator";
import { Badge } from "@/components/ui/badge";
import { ArtifactPanel } from "@/components/accelerator/artifact-panel";
import { readJsonField } from "@/lib/json-field";
import {
  FeaturesTable,
  JiraEpicsList,
  RoadmapList,
} from "@/components/accelerator/features-table";
import {
  ApprovePackageButton,
  GeneratePackageButton,
} from "@/components/accelerator/project-actions";

export default async function AcceleratorProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  const project = await prisma.acceleratorProject.findFirst({
    where: { id, organizationId: session.organizationId },
  });

  if (!project) notFound();

  const features = readJsonField(project.featuresJson, []) as AcceleratorFeature[];
  const jiraEpics = readJsonField(project.jiraEpicsJson, []) as JiraEpic[];
  const roadmap = readJsonField(project.roadmapJson, []) as RoadmapPhase[];

  const hasPackage = Boolean(project.prdMarkdown);
  const canApprove = project.status === "PENDING_APPROVAL";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/accelerator" className="text-sm text-rust hover:underline">
          ← Launchpad
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-normal tracking-[-0.23px] text-ink">
              {project.title}
            </h1>
            <p className="mt-1 max-w-3xl text-graphite">{project.idea}</p>
          </div>
          <Badge
            variant={
              project.status === "APPROVED"
                ? "success"
                : project.status === "PENDING_APPROVAL"
                  ? "warning"
                  : "ai"
            }
          >
            {project.status.replace(/_/g, " ")}
          </Badge>
        </div>
      </div>

      {project.status === "APPROVED" && (
        <div className="rounded-3xl border border-success/30 bg-success-muted px-4 py-3 text-sm text-success">
          MVP package approved on {project.approvedAt?.toLocaleString()}. Ready for
          engineering execution and Jira import.
        </div>
      )}

      {!hasPackage && (
        <div className="rounded-3xl border border-rust/30 bg-apricot-wash/40 p-4">
          <p className="mb-3 text-sm text-rust">
            Generate the full MVP delivery package from your idea.
          </p>
          <GeneratePackageButton projectId={project.id} />
        </div>
      )}

      {canApprove && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-chart-blue/30 bg-sky-wash/50 p-4">
          <p className="text-sm text-chart-blue">
            Review all artifacts below, then approve before engineering starts.
          </p>
          <ApprovePackageButton projectId={project.id} />
        </div>
      )}

      {hasPackage && (
        <>
          <RoadmapList phases={roadmap} />
          <div className="grid gap-6 lg:grid-cols-2">
            <ArtifactPanel title="PRD" content={project.prdMarkdown} />
            <ArtifactPanel title="Architecture" content={project.architectureMarkdown} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-medium text-ink">Feature breakdown</h2>
            <FeaturesTable features={features} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-medium text-ink">Jira epics (export-ready)</h2>
            <JiraEpicsList epics={jiraEpics} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <ArtifactPanel title="QA plan" content={project.qaPlanMarkdown} />
            <ArtifactPanel title="Deployment plan" content={project.deploymentPlanMarkdown} />
          </div>
        </>
      )}
    </div>
  );
}
