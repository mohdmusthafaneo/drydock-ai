import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/roles";
import { hasPermission } from "@/lib/rbac";
import { WORKSPACE_META, type WorkspaceMode } from "@/lib/workspace-mode";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModeSwitcher } from "@/components/layout/mode-switcher";
import { ThemeToggleLabeled } from "@/components/theme/theme-toggle";
import { TeamInviteForm } from "@/components/team/team-invite-form";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, members, dna] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.organizationId } }),
    prisma.user.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.deliveryDNA.findUnique({ where: { organizationId: session.organizationId } }),
  ]);

  const mode = (org?.workspaceMode ?? "MVP") as WorkspaceMode;
  const meta = WORKSPACE_META[mode];
  const canInvite = hasPermission(session, "admin", "manage_team");

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader title="Settings" description={`${meta.label} · ${meta.tagline}`} />

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Dark theme aligned with enterprise marketing surfaces.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeToggleLabeled />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace experience</CardTitle>
          <CardDescription>
            MVP for incubation; Enterprise for governance & operational intelligence (Phase 1).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModeSwitcher current={mode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{org?.name}</CardTitle>
          <CardDescription>Organization slug: {org?.slug}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted">Your role: </span>
            <span className="text-primary">{ROLE_LABELS[session.role]}</span>
          </p>
          {dna && mode === "ENTERPRISE" && (
            <p>
              <span className="text-muted">Autonomy: </span>
              <Badge variant="ai">{dna.autonomyMode}</Badge>
              <span className="ml-2 text-muted">(recommend-only in Phase 1)</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team management</CardTitle>
          <CardDescription>Invite users with RBAC roles — Phase 1 foundation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <TeamInviteForm canInvite={canInvite} />
          <div className="space-y-2 border-t border-border pt-4">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-elevated px-4 py-2 text-sm"
              >
                <span className="text-primary">
                  {m.name} · {m.email}
                </span>
                <span className="text-muted">
                  {ROLE_LABELS[m.role]}
                  {m.lastLoginAt && ` · last login ${m.lastLoginAt.toLocaleDateString()}`}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
