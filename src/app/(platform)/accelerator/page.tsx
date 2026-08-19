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
          <div className="mb-2 flex items-center gap-2 text-rust">
            <Rocket className="h-5 w-5" />
            <span className="text-sm font-medium">MVP Launchpad</span>
          </div>
          <h1 className="font-display text-[26px] font-normal tracking-[-0.23px] text-ink">
            Ship your next idea
          </h1>
          <p className="mt-1 max-w-xl text-graphite">
            One flow: idea → PRD → architecture → Jira epics → QA & deploy plans → approve.
          </p>
        </div>
        <Button asChild variant="ink" size="lg">
          <Link href="/accelerator/new">+ New MVP</Link>
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="border-dashed border-rust/30 bg-apricot-wash/30">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Rocket className="mb-4 h-12 w-12 text-rust" />
            <h2 className="text-lg font-medium text-ink">No MVPs yet</h2>
            <p className="mt-2 max-w-sm text-sm text-graphite">
              Describe your product idea and generate a full delivery package in under five
              minutes.
            </p>
            <Button asChild className="mt-6" variant="ink">
              <Link href="/accelerator/new">Create your first MVP</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-graphite">Your MVP projects</h2>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/accelerator/${p.id}`}
              className="block rounded-3xl border border-dove/50 bg-pure-white p-5 shadow-[var(--shadow-subtle)] transition-colors hover:border-rust/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-lg font-medium text-ink">{p.title}</p>
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
              <p className="mt-2 line-clamp-2 text-sm text-graphite">{p.idea}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
