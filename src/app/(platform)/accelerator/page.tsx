import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket } from "lucide-react";

export default async function MvpLaunchpadPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { workspaceMode: true },
  });

  if (org?.workspaceMode === "ENTERPRISE") {
    redirect("/dashboard");
  }

  const projects = await prisma.acceleratorProject.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[#c4b5fd]">
            <Rocket className="h-5 w-5" />
            <span className="text-sm font-medium">MVP Launchpad</span>
          </div>
          <h1 className="text-2xl font-semibold">Ship your next idea</h1>
          <p className="mt-1 max-w-xl text-slate-400">
            One flow: idea → PRD → architecture → Jira epics → QA & deploy plans → approve.
          </p>
        </div>
        <Button asChild variant="ai" size="lg">
          <Link href="/accelerator/new">+ New MVP</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed border-[#8B5CF6]/40 bg-[#8B5CF6]/5">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Rocket className="mb-4 h-12 w-12 text-[#8B5CF6]" />
            <h2 className="text-lg font-medium">No MVPs yet</h2>
            <p className="mt-2 max-w-sm text-sm text-slate-400">
              Describe your product idea and generate a full delivery package in under five
              minutes.
            </p>
            <Button asChild className="mt-6" variant="ai">
              <Link href="/accelerator/new">Create your first MVP</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-500">Your MVP projects</h2>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/accelerator/${p.id}`}
              className="block rounded-xl border border-white/8 bg-[#1B2435] p-5 transition-colors hover:border-[#8B5CF6]/40"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-lg font-medium">{p.title}</p>
                <Badge
                  variant={
                    p.status === "APPROVED"
                      ? "success"
                      : p.status === "PENDING_APPROVAL"
                        ? "warning"
                        : "ai"
                  }
                >
                  {p.status.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-500">{p.idea}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
