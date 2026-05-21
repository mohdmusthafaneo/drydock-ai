import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { AcceleratorFeature, JiraEpic, RoadmapPhase } from "@/lib/mvp-accelerator";
import { Badge } from "@/components/ui/badge";
import { ArtifactPanel } from "@/components/accelerator/artifact-panel";
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

  const features = JSON.parse(project.featuresJson || "[]") as AcceleratorFeature[];
  const jiraEpics = JSON.parse(project.jiraEpicsJson || "[]") as JiraEpic[];
  const roadmap = JSON.parse(project.roadmapJson || "[]") as RoadmapPhase[];

  const hasPackage = Boolean(project.prdMarkdown);
  const canApprove = project.status === "PENDING_APPROVAL";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/accelerator" className="text-sm text-[#c4b5fd] hover:underline">
          ← Launchpad
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{project.title}</h1>
            <p className="mt-1 max-w-3xl text-slate-400">{project.idea}</p>
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
        <div className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 px-4 py-3 text-sm text-[#6ee7b7]">
          MVP package approved on {project.approvedAt?.toLocaleString()}. Ready for
          engineering execution and Jira import.
        </div>
      )}

      {!hasPackage && (
        <div className="rounded-xl border border-[#8B5CF6]/30 bg-[#8B5CF6]/10 p-4">
          <p className="mb-3 text-sm text-[#c4b5fd]">
            Generate the full MVP delivery package from your idea.
          </p>
          <GeneratePackageButton projectId={project.id} />
        </div>
      )}

      {canApprove && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#4F8CFF]/30 bg-[#4F8CFF]/10 p-4">
          <p className="text-sm text-[#93b4ff]">
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
            <h2 className="mb-3 text-lg font-semibold">Feature breakdown</h2>
            <FeaturesTable features={features} />
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">Jira epics (export-ready)</h2>
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
