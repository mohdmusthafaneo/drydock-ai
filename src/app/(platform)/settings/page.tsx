import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Settings"
        description="Your profile, team, and workspace shortcuts — governance operations live in Admin."
      />

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
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
          <CardDescription>Operational shortcuts for your workspace.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <Link href="/integrations" className="text-ink underline-offset-4 hover:underline">
            Integrations
          </Link>
          <Link href="/audit" className="text-ink underline-offset-4 hover:underline">
            Audit logs
          </Link>
          {dna && (
            <Link href="/governance" className="text-ink underline-offset-4 hover:underline">
              Delivery DNA
            </Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team management</CardTitle>
          <CardDescription>Manage team members and their RBAC roles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
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
        </CardContent>
      </Card>
    </div>
  );
}
